// 个人中心：登录信息、学习统计、退出登录。
const { cloud } = require('../../utils/cloud');

Page({
    data: {
        authState: 'checking',
        user: null,
        articleCount: 0,
        wordCount: 0,
        speakingCount: 0,
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
            this.setData({ authState: 'signed-out', user: null });
            return;
        }
        this.setData({ authState: 'signed-in', user: session.user || null });
        this.loadStats();
    },

    onSignedIn() {
        getApp().resetSession();
        this.restore();
    },

    async loadStats() {
        const wordResult = await cloud.database
            .from('words')
            .select('id', { count: 'exact', head: true });
        const speakingResult = await cloud.database
            .from('speaking_sessions')
            .select('id', { count: 'exact', head: true });
        this.setData({
            wordCount: wordResult.count || 0,
            speakingCount: speakingResult.count || 0,
        });
    },

    async signOut() {
        await cloud.auth.signOut();
        getApp().resetSession();
        this.restore();
    },
});
