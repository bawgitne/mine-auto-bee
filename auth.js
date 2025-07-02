const { Authflow } = require('prismarine-auth');
const path = require('path');

/**
 * Lấy token xác thực Minecraft Java Edition.
 * @param {string} userIdentifier - Mã định danh duy nhất cho người dùng.
 * @param {string} cacheDir - Thư mục để lưu trữ cache.
 * @returns {Promise<object>} - Promise trả về đối tượng token và thông tin profile.
 */
async function getAuthToken(userIdentifier, cacheDir) {
    const absoluteCacheDir = path.resolve(cacheDir); // Đảm bảo đường dẫn là tuyệt đối
    const flow = new Authflow(userIdentifier, absoluteCacheDir);
    try {
        const token = await flow.getMinecraftJavaToken({ fetchProfile: true });
        return token;
    } catch (error) {
        console.error('Lỗi khi lấy token xác thực:', error);
        throw error;
    }
}

module.exports = { getAuthToken };