const mineflayer = require('mineflayer');
const { pathfinder, Movements, goals } = require('mineflayer-pathfinder');
const viewer = require('prismarine-viewer').mineflayer;
const { getAuthToken } = require('./auth');
const fs = require('fs'); // Đảm bảo đã import fs
const path = require('path'); // Đảm bảo đã import path

const USER_IDENTIFIER = 'gigaZ_';
const CACHE_DIR = './auth_cache';
const RECORD_FILE = path.join(__dirname, 'player_path_record.json'); // Đường dẫn tới file bản ghi

// Thời gian chờ trước khi thử kết nối lại (tính bằng mili giây)
const RECONNECT_DELAY = 5000; // 5 giây

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

// Hàm chính để khởi tạo và chạy bot
async function createAndRunBot() {
    let bot; // Khai báo biến bot ở ngoài để có thể truy cập từ các sự kiện

    try {
        console.log('🔐 Đang lấy token xác thực Minecraft...');
        const tokenData = await getAuthToken(USER_IDENTIFIER, CACHE_DIR);
        console.log('✅ Đã lấy token. Đăng nhập với username:', tokenData.profile.name);

        bot = mineflayer.createBot({
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

            // --- Bắt đầu đọc và đi theo bản ghi ---
            let recordedPath = [];
            try {
                const data = fs.readFileSync(RECORD_FILE, 'utf8');
                recordedPath = JSON.parse(data);
                console.log(`📂 Đã tải ${recordedPath.length} điểm từ file bản ghi: ${RECORD_FILE}`);
            } catch (readErr) {
                console.error(`❌ Không thể đọc hoặc phân tích cú pháp file bản ghi (${RECORD_FILE}):`, readErr.message);
                console.log('Vui lòng đảm bảo bạn đã tạo file player_path_record.json với các tọa độ hợp lệ.');
                return; // Dừng nếu không có bản ghi để theo
            }

            if (recordedPath.length === 0) {
                console.log('⚠️ File bản ghi rỗng. Bot sẽ không di chuyển theo đường ghi.');
                return;
            }

            console.log('🚶‍♂️ Bắt đầu đi theo đường ghi...');
            for (let i = 0; i < recordedPath.length; i++) {
                const point = recordedPath[i];
                const targetGoal = new goals.GoalBlock(point.x, point.y, point.z);
                const arrived = await moveToGoal(bot, targetGoal, `điểm ${i + 1}/${recordedPath.length}`);

                if (!arrived) {
                    console.log(`🛑 Dừng theo dõi bản ghi vì không đến được điểm ${i + 1}.`);
                    break; // Dừng vòng lặp nếu không đến được điểm này
                }

                // Tùy chọn: Thêm một độ trễ nhỏ giữa mỗi điểm để bot không di chuyển quá nhanh
                // await wait(100);
            }
            console.log('✅ Bot đã hoàn thành việc theo dõi bản ghi (hoặc đã cố gắng hết sức).');

            // --- Kết thúc chuỗi hành động ---
        });

        bot.on('chat', (username, message) => {
            if (username === bot.username) return;
            console.log(`💬 ${username}: ${message}`);
        });

        bot.on('kicked', (reason, loggedIn) => console.log(`🚫 Bot bị kick: ${reason}`));
        bot.on('error', err => console.error('⚠️ Lỗi bot:', err));

        // --- Logic tự động kết nối lại ---
        bot.on('end', async (reason) => {
            console.log(`🔌 Bot đã ngắt kết nối. Lý do: ${reason}`);
            console.log(`🔄 Đang thử kết nối lại sau ${RECONNECT_DELAY / 1000} giây...`);
            await wait(RECONNECT_DELAY);
            createAndRunBot(); // Gọi lại hàm để khởi tạo và chạy bot
        });
        // --- Kết thúc logic tự động kết nối lại ---

    } catch (err) {
        console.error('❌ Không thể khởi động bot:', err);
        console.log(`🔄 Thử kết nối lại sau ${RECONNECT_DELAY / 1000} giây do lỗi khởi tạo...`);
        await wait(RECONNECT_DELAY);
        createAndRunBot(); // Thử kết nối lại nếu có lỗi ngay từ đầu
    }
}

// Bắt đầu chạy bot lần đầu tiên
createAndRunBot();
