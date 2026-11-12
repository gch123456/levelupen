// 文章详情：正文逐词展示，点词查释义（LLM），可加入生词本。
const { cloud, getDefaultModel } = require('../../utils/cloud');

Page({
    data: {
        id: null,
        viewState: 'loading',
        article: null,
        tokens: [],
        showTranslation: false,
        wordPopup: null,
        savingWord: false,
    },

    onLoad(options) {
        this.setData({ id: Number(options.id) });
        this.loadArticle();
    },

    async loadArticle() {
        this.setData({ viewState: 'loading' });
        const result = await cloud.database
            .from('articles')
            .select('id, topic, level, title, title_cn, content, translation, word_count, created_at')
            .eq('id', this.data.id)
            .maybeSingle();
        if (result.error || !result.data) {
            this.setData({ viewState: 'error' });
            return;
        }
        this.setData({
            viewState: 'ready',
            article: result.data,
            tokens: this.tokenize(result.data.content),
        });
    },

    // 把正文切成带索引的词与间隔符数组，供 WXML 逐词渲染与点击。
    tokenize(content) {
        const raw = String(content || '');
        const parts = raw.split(/(\s+)/);
        const tokens = [];
        let index = 0;
        for (const part of parts) {
            if (part === '') {
                continue;
            }
            if (/^\s+$/.test(part)) {
                tokens.push({ kind: 'space', text: ' ', i: index++ });
            } else {
                const word = part.replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9]+$/g, '');
                tokens.push({
                    kind: word.length > 0 ? 'word' : 'punct',
                    text: part,
                    word: word.toLowerCase(),
                    i: index++,
                });
            }
        }
        return tokens;
    },

    async onWordTap(event) {
        const word = event.currentTarget.dataset.word;
        if (!word) {
            return;
        }
        this.setData({
            wordPopup: { word: word, meaning: '', loading: true },
        });
        const meaning = await this.lookupWord(word);
        if (this.data.wordPopup && this.data.wordPopup.word === word) {
            this.setData({ 'wordPopup.meaning': meaning || '暂无释义', 'wordPopup.loading': false });
        }
    },

    closePopup() {
        this.setData({ wordPopup: null });
    },

    stopBubble() {
        // 阻止冒泡，点击弹窗本身不关闭。
    },

    async lookupWord(word) {
        const modelId = await getDefaultModel();
        if (!modelId) {
            return '当前没有可用模型';
        }
        let answer = '';
        for await (const chunk of cloud.llm.chat.completions.create({
            model: modelId,
            messages: [
                { role: 'system', content: 'You are an English dictionary for Chinese learners. Reply in Chinese, be concise.' },
                { role: 'user', content: `Explain the English word "${word}" for a Chinese learner in 1-2 sentences: its meaning, part of speech and one short example. Do not use Markdown.` },
            ],
            stream: true,
        })) {
            const delta = chunk.choices[0] && chunk.choices[0].delta && chunk.choices[0].delta.content;
            if (delta) {
                answer += delta;
            }
        }
        return answer.trim();
    },

    toggleTranslation() {
        this.setData({ showTranslation: !this.data.showTranslation });
    },

    // 加入生词本：登录用户把词存入 words 表（owner 由服务端决定）。
    async saveWord() {
        if (this.data.savingWord) {
            return;
        }
        const popup = this.data.wordPopup;
        if (!popup || !popup.word) {
            return;
        }
        this.setData({ savingWord: true });
        const sessionResult = await getApp().ensureSession();
        const session = sessionResult && !sessionResult.error ? sessionResult.data : null;
        if (!session) {
            this.setData({ savingWord: false });
            wx.showToast({ title: '请先登录', icon: 'none' });
            return;
        }
        const result = await cloud.database.from('words').insert({
            word: popup.word,
            definition: popup.meaning,
            source_title: this.data.article ? this.data.article.title : '',
        }).select('id');
        this.setData({ savingWord: false });
        if (result.error) {
            wx.showToast({ title: result.error.message || '保存失败', icon: 'none' });
            return;
        }
        wx.showToast({ title: '已加入生词本', icon: 'success' });
        this.closePopup();
    },
});
