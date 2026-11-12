const { cloud } = require('./utils/cloud');

App({
    globalData: {
        appName: 'LevelUp英语',
    },

    // 会话缓存：登录或退出后由 resetSession() 重置。
    ensureSession() {
        if (!this.sessionPromise) {
            this.sessionPromise = cloud.auth.getSession();
        }
        return this.sessionPromise;
    },

    resetSession() {
        this.sessionPromise = null;
    },
});
