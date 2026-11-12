// 口语训练：选择情景 -> 与 AI 英文对话；可对 AI 的话跟读并获点评。
const { cloud, getDefaultModel } = require('../../utils/cloud');

const SCENARIOS = [
    { key: 'coffee', label: '咖啡店点单', brief: 'You are a barista. The user is ordering coffee.' },
    { key: 'travel', label: '机场值机', brief: 'You are an airport check-in agent helping the user.' },
    { key: 'interview', label: '面试开场', brief: 'You are a friendly interviewer starting a job interview.' },
    { key: 'friends', label: '朋友闲聊', brief: 'You are a friendly native speaker making small talk.' },
    { key: 'shopping', label: '商场购物', brief: 'You are a shop assistant helping the user find clothes.' },
    { key: 'restaurant', label: '餐厅点餐', brief: 'You are a waiter taking the user order.' },
];

const recorder = wx.getRecorderManager();

Page({
    data: {
        authState: 'checking',
        scenarios: SCENARIOS,
        activeScenario: null,
        messages: [],
        inputText: '',
        sending: false,
        recording: false,
    },

    onLoad() {
        // 录音监听只注册一次，避免重复回调。
        recorder.onStop((res) => {
            this.setData({ recording: false });
            if (this.reviewIndex !== null && this.reviewIndex !== undefined) {
                this.reviewRecording(res.tempFilePath, this.reviewIndex);
                this.reviewIndex = null;
            }
        });
        recorder.onError(() => {
            this.setData({ recording: false });
            wx.showToast({ title: '录音失败，请检查麦克风权限', icon: 'none' });
        });
    },

    onShow() {
        this.restore();
    },

    async restore() {
        this.setData({ authState: 'checking' });
        const sessionResult = await getApp().ensureSession();
        const session = sessionResult && !sessionResult.error ? sessionResult.data : null;
        if (!session) {
            getApp().resetSession();
            this.setData({ authState: 'signed-out', activeScenario: null, messages: [] });
            return;
        }
        this.setData({ authState: 'signed-in' });
    },

    onSignedIn() {
        getApp().resetSession();
        this.restore();
    },

    pickScenario(event) {
        const key = event.currentTarget.dataset.key;
        const scenario = SCENARIOS.find((item) => item.key === key);
        if (!scenario) {
            return;
        }
        this.conversationId = null;
        this.setData({
            activeScenario: scenario,
            messages: [],
            inputText: '',
        });
        this.greet(scenario);
    },

    exitScenario() {
        this.setData({ activeScenario: null, messages: [] });
    },

    // 开场白：独立请求。
    async greet(scenario) {
        this.pushMessage('assistant', '');
        const reply = await this.chat(
            [{ role: 'user', content: 'Start the conversation with your opening line.' }],
            scenario.brief
        );
        this.patchLastMessage(reply || 'Hello! How can I help you today?');
    },

    pushMessage(role, content) {
        const messages = this.data.messages.concat([
            { i: this.data.messages.length, role: role, content: content, review: '', reviewing: false },
        ]);
        this.setData({ messages: messages, scrollTop: messages.length * 400 });
    },

    patchLastMessage(content) {
        const key = `messages[${this.data.messages.length - 1}].content`;
        this.setData({ [key]: content });
    },

    onInput(event) {
        this.setData({ inputText: event.detail.value });
    },

    async send() {
        const text = (this.data.inputText || '').trim();
        if (text === '' || this.data.sending) {
            return;
        }
        const history = this.data.messages
            .filter((item) => item.content)
            .map((item) => ({ role: item.role, content: item.content }));
        this.setData({ inputText: '', sending: true });
        this.pushMessage('user', text);
        this.pushMessage('assistant', '');
        const reply = await this.chat(
            history.concat([{ role: 'user', content: text }]),
            this.data.activeScenario.brief
        );
        this.patchLastMessage(reply || 'Sorry, could you say that again?');
        this.setData({ sending: false });
    },

    // 对话主调用：system 固定第一位；同一次情景用同一 conversationId。
    async chat(userMessages, brief) {
        const modelId = await getDefaultModel();
        if (!modelId) {
            return '当前没有可用模型';
        }
        if (!this.conversationId) {
            this.conversationId = 'spk-' + Date.now() + '-' + Math.floor(Math.random() * 10000);
        }
        const system = `You are an English speaking practice partner. Scene: ${brief} Reply in short, natural English (max 2 sentences). Ask one follow-up question to keep the user talking.`;
        let answer = '';
        try {
            for await (const chunk of cloud.llm.chat.completions.create({
                model: modelId,
                messages: [{ role: 'system', content: system }].concat(userMessages),
                stream: true,
                conversationId: this.conversationId,
            })) {
                const delta = chunk.choices[0] && chunk.choices[0].delta && chunk.choices[0].delta.content;
                if (delta) {
                    answer += delta;
                }
            }
        } catch (error) {
            return '';
        }
        return answer.trim();
    },

    // ---- 跟读 + 点评 ----
    onRecordTap(event) {
        if (this.data.recording) {
            recorder.stop();
            return;
        }
        this.reviewIndex = Number(event.currentTarget.dataset.index);
        this.setData({ recording: true });
        recorder.start({
            duration: 15000,
            format: 'mp3',
        });
    },

    async reviewRecording(tempFilePath, index) {
        const target = this.data.messages[index];
        if (!target) {
            return;
        }
        this.setData({ [`messages[${index}].reviewing`]: true });
        const modelId = await getDefaultModel();
        let review = '';
        if (modelId) {
            let answer = '';
            try {
                for await (const chunk of cloud.llm.chat.completions.create({
                    model: modelId,
                    messages: [
                        { role: 'system', content: 'You are a kind spoken-English coach. Reply in Chinese, be brief.' },
                        { role: 'user', content: `The learner read this sentence aloud: "${target.content}" Give 1 short pronunciation tip in Chinese for tricky words in it (under 40 chars). Do not use Markdown.` },
                    ],
                    stream: true,
                })) {
                    const delta = chunk.choices[0] && chunk.choices[0].delta && chunk.choices[0].delta.content;
                    if (delta) {
                        answer += delta;
                    }
                }
            } catch (error) {
                answer = '';
            }
            review = answer.trim();
        }
        this.setData({
            [`messages[${index}].reviewing`]: false,
            [`messages[${index}].review`]: review || '跟读完成，继续保持！',
        });
    },
});
