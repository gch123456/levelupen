// 首页：分级阅读。等级切换 + 文章列表；未登录可浏览，登录后可生成新文章。
const { cloud } = require('../../utils/cloud');

const LEVELS = [
    { key: 1, label: 'L1 入门' },
    { key: 2, label: 'L2 进阶' },
    { key: 3, label: 'L3 高级' },
];

const TOPIC_PRESETS = ['科技', '生活', '旅行', '职场', '环境', '文化'];

Page({
    data: {
        levels: LEVELS,
        currentLevel: 1,
        articles: [],
        viewState: 'loading',
        authState: 'checking',
        topics: TOPIC_PRESETS,
        generating: false,
        topicInput: '',
    },

    onLoad(options) {
        const level = Number(options.level);
        this.setData({
            currentLevel: level >= 1 && level <= 3 ? level : 1,
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
            this.setData({ authState: 'signed-out' });
        } else {
            this.setData({ authState: 'signed-in', user: session.user || null });
        }
        this.loadArticles();
    },

    onSignedIn() {
        getApp().resetSession();
        this.restore();
    },

    switchLevel(event) {
        const level = Number(event.currentTarget.dataset.level);
        if (level === this.data.currentLevel) {
            return;
        }
        this.setData({ currentLevel: level });
        this.loadArticles();
    },

    async loadArticles() {
        this.setData({ viewState: 'loading' });
        const result = await cloud.database
            .from('articles')
            .select('id, topic, level, title, title_cn, word_count, audio, created_at')
            .eq('level', this.data.currentLevel)
            .order('created_at', { ascending: false })
            .limit(30);
        if (result.error) {
            this.setData({ viewState: 'error' });
            return;
        }
        const rows = Array.isArray(result.data) ? result.data : [];
        this.setData({
            viewState: rows.length === 0 ? 'empty' : 'ready',
            articles: rows,
        });
    },

    openArticle(event) {
        const id = event.currentTarget.dataset.id;
        wx.navigateTo({
            url: `/pages/article/article?id=${id}`,
        });
    },

    onTopicInput(event) {
        this.setData({ topicInput: event.detail.value });
    },

    pickTopic(event) {
        this.setData({ topicInput: event.currentTarget.dataset.topic, generating: false });
    },

    // 登录用户：AI 生成一篇当前等级的文章并存入 articles（公开可读）。
    async generateArticle() {
        if (this.data.generating) {
            return;
        }
        if (this.data.authState !== 'signed-in') {
            wx.showToast({ title: '请先登录', icon: 'none' });
            return;
        }
        const topic = (this.data.topicInput || '').trim();
        if (topic === '') {
            wx.showToast({ title: '先输入或选择一个话题', icon: 'none' });
            return;
        }
        this.setData({ generating: true });
        try {
            const generated = await this.callGenerator(topic, this.data.currentLevel);
            if (generated.error) {
                wx.showToast({ title: generated.error, icon: 'none' });
                return;
            }
            const saved = await cloud.database.from('articles').insert({
                topic: topic,
                level: this.data.currentLevel,
                title: generated.title,
                title_cn: generated.titleCn,
                content: generated.content,
                translation: generated.translation,
                word_count: generated.wordCount,
            }).select('id');
            if (saved.error) {
                wx.showToast({ title: saved.error.message || '保存失败', icon: 'none' });
                return;
            }
            this.setData({ topicInput: '' });
            await this.loadArticles();
            wx.showToast({ title: '已生成', icon: 'success' });
        } finally {
            this.setData({ generating: false });
        }
    },

    async callGenerator(topic, level) {
        const { getDefaultModel } = require('../../utils/cloud');
        const modelId = await getDefaultModel();
        if (!modelId) {
            return { error: '当前没有可用模型' };
        }
        const system = 'You write graded English reading articles for Chinese learners. Reply with JSON only.';
        const spec = [
            `Write a short English news-style article about "${topic}" for CEFR level ${level === 1 ? 'A1-A2' : level === 2 ? 'B1' : 'B2'}.`,
            level === 1 ? 'Use about 110-130 simple words, present tense, very common vocabulary.' : '',
            level === 2 ? 'Use about 150-180 words, some compound sentences.' : '',
            level === 3 ? 'Use about 200-230 words, natural news language, richer vocabulary.' : '',
            'Return strict JSON: {"title": string, "titleCn": string, "content": string, "translation": string, "wordCount": number}.',
            '"content" is the English article (plain text, sentences separated by spaces, no line breaks).',
            '"translation" is its Chinese translation.',
        ].filter(Boolean).join(' ');

        let answer = '';
        for await (const chunk of cloud.llm.chat.completions.create({
            model: modelId,
            messages: [
                { role: 'system', content: system },
                { role: 'user', content: spec },
            ],
            stream: true,
            response_format: { type: 'json_object' },
        })) {
            const delta = chunk.choices[0] && chunk.choices[0].delta && chunk.choices[0].delta.content;
            if (delta) {
                answer += delta;
            }
        }
        try {
            const parsed = JSON.parse(answer);
            if (!parsed.title || !parsed.content) {
                return { error: '生成内容不完整，请重试' };
            }
            return {
                title: String(parsed.title),
                titleCn: parsed.titleCn ? String(parsed.titleCn) : '',
                content: String(parsed.content),
                translation: parsed.translation ? String(parsed.translation) : '',
                wordCount: Number(parsed.wordCount) || String(parsed.content).split(/\s+/).length,
            };
        } catch (error) {
            return { error: '生成失败，请重试' };
        }
    },
});
