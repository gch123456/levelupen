// WorkBuddy Cloud 客户端：唯一实例，供全部页面与登录组件复用。
// publicConfig 来自云服务激活结果，endpoint 与 publishableKey 必传。
const { createMiniProgramWorkBuddyCloud } = require('@tencent-ai/workbuddy-cloud-sdk/miniprogram');
const { createDiagnosticWx } = require('./workbuddy-cloud-diagnostics');

const publicConfig = {
    endpoint: 'https://mp-api.app.workbuddy.host',
    publishableKey: 'wbpk_nKjD3GfnvG003CikVIKv6Z_7X3icZi3lpVBQ8RrzmIkFgCsvfRo6onn',
};

const cloud = createMiniProgramWorkBuddyCloud({
    endpoint: publicConfig.endpoint,
    publishableKey: publicConfig.publishableKey,
    wx: createDiagnosticWx(wx),
});

// 缓存默认可用模型，避免每次调用都拉模型列表。
let cachedModelId = null;

async function getDefaultModel() {
    if (cachedModelId) {
        return cachedModelId;
    }
    const models = await cloud.llm.models.list();
    const usable = Array.isArray(models) ? models.filter((item) => item && item.disabled !== true) : [];
    if (usable.length === 0) {
        return null;
    }
    cachedModelId = usable[0].id;
    return cachedModelId;
}

module.exports = { cloud, getDefaultModel };
