const mineflayer = require('mineflayer');
const { pathfinder, Movements, goals } = require('mineflayer-pathfinder');
const viewer = require('prismarine-viewer').mineflayer;
const { getAuthToken } = require('./auth');

const USER_IDENTIFIER = 'gigaZ_';
const CACHE_DIR = './auth_cache';

/**
 * Tạm dừng thực thi chương trình trong một khoảng thời gian nhất định.
 * Chỉ nên dùng trong các hàm async.
 * @param {number} ms - Thời gian chờ tính bằng mili giây.
 * @returns {Promise<void>} - Một Promise sẽ resolved sau thời gian đã cho.
 */
function wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Hàm xử lý di chuyển với timeout và retry, cải tiến từ trước
async function moveToGoal(bot, targetGoal, goalName = 'mục tiêu', maxAttempts = 3, attemptDelay = 5000) {
    for (let i = 1; i <= maxAttempts; i++) {
        try {
            console.log(`🧭 Lần ${i}/${maxAttempts}: Đang di chuyển bot đến ${goalName} (${targetGoal.x}, ${targetGoal.y}, ${targetGoal.z})...`);
            await bot.pathfinder.goto(targetGoal);
            console.log(`✅ Bot đã đến ${goalName}.`);
            return true; // Đến đích thành công
        } catch (err) {
            if (err.name === 'NoPath') {
                console.log(`❌ Lần ${i}/${maxAttempts}: Không tìm thấy đường đi đến ${goalName}. Có thể bị chặn hoặc quá xa.`);
            } else if (err.message.includes('Goal is unreachable')) {
                 console.log(`❌ Lần ${i}/${maxAttempts}: ${goalName} không thể tiếp cận được. Chi tiết: ${err.message}`);
            } else {
                console.log(`❌ Lần ${i}/${maxAttempts}: Lỗi di chuyển đến ${goalName}: ${err.message}`);
            }

            if (i < maxAttempts) {
                console.log(`🔄 Thử lại sau ${attemptDelay / 1000} giây. Cố gắng "lắc" bot...`);
                // Thử nhảy và đi một chút để thoát kẹt
                bot.setControlState('jump', true);
                await wait(200);
                bot.setControlState('jump', false);
                bot.setControlState('forward', true);
                await wait(200);
                bot.setControlState('forward', false);
                await wait(attemptDelay); // Chờ trước khi thử lại
            }
        }
    }
    console.log(`🔴 Bot không thể đến ${goalName} sau ${maxAttempts} lần thử.`);
    return false; // Không thể đến đích sau tất cả các lần thử
}

async function startBot() {
    try {
        console.log('🔐 Đang lấy token xác thực Minecraft...');
        const tokenData = await getAuthToken(USER_IDENTIFIER, CACHE_DIR);
        console.log('✅ Đã lấy token. Đăng nhập với username:', tokenData.profile.name);

        const bot = mineflayer.createBot({
            host: 'play.beesim.gg', // Thay đổi thành địa chỉ IP hoặc tên miền của máy chủ Minecraft
            port: 25565,       // Thay đổi thành cổng của máy chủ Minecraft
            username: tokenData.profile.name,
            auth: 'microsoft',
            accessToken: tokenData.token,
        });

        bot.loadPlugin(pathfinder);

        bot.once('spawn', async () => {
            console.log(`✅ Bot đã đăng nhập với tên: ${bot.username}`);

            viewer(bot, { port: 3000 });
            console.log('🌐 Viewer hoạt động tại: http://localhost:3000');

            const defaultMove = new Movements(bot);
            bot.pathfinder.setMovements(defaultMove);

            // --- Bắt đầu chuỗi hành động di chuyển ---

            // Bước 1: Di chuyển tới tọa độ (5, 100, 0)
            const firstTargetPos = new goals.GoalBlock(5, 100, 0);
            const arrivedFirst = await moveToGoal(bot, firstTargetPos, 'điểm đầu tiên');
            if (!arrivedFirst) {
                console.log('🛑 Dừng chuỗi di chuyển vì không đến được điểm đầu tiên.');
                return; // Dừng nếu không đến được điểm đầu
            }

            // Bước 2: Chờ 2 giây
            console.log('⏳ Chờ 2 giây...');
            await wait(2000);

            // Bước 3: Di chuyển tới tọa độ (-51, 102, -24)
            const secondTargetPos = new goals.GoalBlock(-52, 102, -18);
            const arrivedSecond = await moveToGoal(bot, secondTargetPos, 'điểm thứ hai');
            if (!arrivedSecond) {
                console.log('🛑 Dừng chuỗi di chuyển vì không đến được điểm thứ hai.');
                return; // Dừng nếu không đến được điểm thứ hai
            }

            // Bước 4: Chờ 6 giây (như yêu cầu của bạn, tôi đã sửa từ 2s thành 6s)
            console.log('⏳ Chờ 6 giây...');
            await wait(6000); // Đã sửa từ 2000 thành 6000

            // Bước 5: Di chuyển tới tọa độ (-83, 102, -14)
            const thirdTargetPos = new goals.GoalBlock(-83, 102, -14);
            const arrivedThird = await moveToGoal(bot, thirdTargetPos, 'điểm thứ ba');
            if (!arrivedThird) {
                console.log('🛑 Dừng chuỗi di chuyển vì không đến được điểm thứ ba.');
                return; // Dừng nếu không đến được điểm thứ ba
            }

            console.log('✅ Bot đã hoàn thành tất cả các điểm trong chuỗi di chuyển.');

            // --- Kết thúc chuỗi hành động ---

        });

        bot.on('chat', (username, message) => {
            if (username === bot.username) return;
            console.log(`💬 ${username}: ${message}`);
        });

        bot.on('kicked', (reason, loggedIn) => console.log(`🚫 Bot bị kick: ${reason}`));
        bot.on('error', err => console.error('⚠️ Lỗi bot:', err));
        bot.on('end', () => console.log('🔌 Bot đã ngắt kết nối.'));

    } catch (err) {
        console.error('❌ Không thể khởi động bot:', err);
    }
}

startBot();