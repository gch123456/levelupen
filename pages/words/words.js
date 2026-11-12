// 生词本：登录后展示本人的生词，支持删除。
const { cloud } = require('../../utils/cloud');

Page({
    data: {
        authState: 'checking',
        viewState: 'loading',
        words: [],
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
            this.setData({ authState: 'signed-out', words: [] });
            return;
        }
        this.setData({ authState: 'signed-in' });
        this.loadWords();
    },

    onSignedIn() {
        getApp().resetSession();
        this.restore();
    },

    async loadWords() {
        this.setData({ viewState: 'loading' });
        const result = await cloud.database
            .from('words')
            .select('id, word, definition, example, source_title, review_count, created_at')
            .order('created_at', { ascending: false })
            .limit(100);
        if (result.error) {
            this.setData({ viewState: 'error' });
            return;
        }
        const rows = Array.isArray(result.data) ? result.data : [];
        this.setData({
            viewState: rows.length === 0 ? 'empty' : 'ready',
            words: rows,
        });
    },

    async removeWord(event) {
        const id = Number(event.currentTarget.dataset.id);
        const result = await cloud.database.from('words').delete().eq('id', id).select('id');
        const removed = Array.isArray(result.data) ? result.data : [];
        if (result.error || removed.length === 0) {
            wx.showToast({ title: '删除失败', icon: 'none' });
            return;
        }
        this.loadWords();
    },
});
