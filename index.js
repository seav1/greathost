const EMAIL = process.env.EMAIL;
const PASSWORD = process.env.PASSWORD;

const { chromium } = require("playwright");

(async () => {
  const GREATHOST_URL = "https://greathost.es";
  const LOGIN_URL = `${GREATHOST_URL}/login`;
  const HOME_URL = `${GREATHOST_URL}/dashboard`;

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  try {
    // === 登录 ===
    console.log("🔑 打开登录页：", LOGIN_URL);
    await page.goto(LOGIN_URL, { waitUntil: "networkidle" });

    await page.fill('input[name="email"]', EMAIL);
    console.log("填写邮箱成功");
    await page.fill('input[name="password"]', PASSWORD);
    console.log("填写密码成功");

    await Promise.all([
      page.click('button[type="submit"]'),
      page.waitForNavigation({ waitUntil: "networkidle" }),
    ]);
    console.log("登录成功！");
    await page.waitForTimeout(5000);

    // === 跳转 dashboard ===
    console.log("📄 打开首页：", HOME_URL);
    await page.goto(HOME_URL, { waitUntil: "networkidle" });
    await page.waitForTimeout(5000);

    // === 查找并点击Manage按钮 ===
    console.log("🔍 查找服务器卡片中的Manage按钮...");
    const manageButton = await page.waitForSelector('div.server-card div.server-actions a.btn.btn-primary:has-text("Manage")');
    
    // 点击按钮并等待导航
    await Promise.all([
      manageButton.click(),
      page.waitForNavigation({ waitUntil: "networkidle", timeout: 15000 })
    ]);
    
    console.log("✅ 成功点击Manage按钮");

    // === 获取服务器状态和ID ===
    console.log("📊 检查服务器状态...");
    
    let serverId, serverStatus;
    
    // 从URL中提取ID
    const currentUrl = page.url();
    const urlMatch = currentUrl.match(/[?&]id=([^&]+)/);
    serverId = urlMatch ? urlMatch[1] : 'unknown';
    
    // 获取服务器状态
    serverStatus = await page.$eval('span#server-status-detail', el => el.textContent.toLowerCase()).catch(() => 'unknown');
    
    console.log(`服务器ID: ${serverId}`);
    console.log(`服务器状态: ${serverStatus}`);

    // === 如果服务器离线则启动 ===
    let serverStarted = false;
    if (serverStatus.includes('offline') || serverStatus.includes('stopping') || serverStatus.includes('stop')) {
      console.log("⚡ 服务器离线或停止中，尝试启动...");
      
      // 导航到控制台页面
      const consoleUrl = `https://greathost.es/server-console.html?id=${serverId}`;
      console.log("📄 导航到控制台页面:", consoleUrl);
      await page.goto(consoleUrl, { waitUntil: "networkidle" });
      
      // 点击启动按钮
      console.log("🖱️ 点击Start按钮...");
      const startButton = await page.waitForSelector('button:has-text("Start")');
      await startButton.click();
      
      // 等待服务器启动
      console.log("⏳ 等待服务器启动...");
      await page.waitForTimeout(5000);
      
      console.log("✅ 启动命令已发送");
      serverStarted = true;
    } else {
      console.log("✅ 服务器已在运行状态");
    }

    // === 跳转到合约页面续期 ===
    const contractUrl = `https://greathost.es/contracts/${serverId}`;
    console.log("📄 打开合约续期页：", contractUrl);
    await page.goto(contractUrl, { waitUntil: "networkidle" });

    // === 获取续期前的时间 ===
    console.log("📊 检查续期前的累计时间...");
    const beforeHours = await page.$eval('#accumulated-time', el => parseInt(el.textContent));
    console.log(`当前累计时间: ${beforeHours} 小时`);

    // === 点击续期按钮 ===
    console.log("⚡ 尝试点击续期按钮...");
    await page.click('button:has-text("续期"), button:has-text("Renew")');
    console.log("✅ 成功点击续期按钮");

    // === 等待页面刷新并检查时间变化 ===
    await page.waitForTimeout(3000);
    
    const afterHours = await page.$eval('#accumulated-time', el => parseInt(el.textContent));
    console.log(`续期后累计时间: ${afterHours} 小时`);

    if (afterHours > beforeHours) {
      console.log("🎉 续期成功！累计时间已增加");
      console.log(`🆔 服务器ID: ${serverId}`);
      console.log(`⏰ 续期前时间: ${beforeHours} 小时`);
      console.log(`⏰ 续期后时间: ${afterHours} 小时`);
      console.log(`🔄 增加时间: ${afterHours - beforeHours} 小时`);
      console.log(`🚀 服务器状态: ${serverStarted ? '已启动' : '已在运行'}`);
      console.log(`📅 续期时间: ${new Date().toLocaleString('zh-CN')}`);
      
      await browser.close();
      process.exit(0);
    } else {
      console.error("⚠️ 续期可能失败，累计时间未增加");
      console.log(`🆔 服务器ID: ${serverId}`);
      console.log(`⏰ 当前时间: ${beforeHours} 小时`);
      console.log(`📅 检查时间: ${new Date().toLocaleString('zh-CN')}`);
      console.log(`💡 提示: 累计时间未增加，可能还没到续期时间`);
      
      await page.screenshot({ path: "renew-fail.png" });
      await browser.close();
      process.exit(3);
    }

  } catch (err) {
    console.error("❌ 脚本出错：", err);
    console.log(`❌ 错误信息: ${err.message}`);
    console.log(`📅 发生时间: ${new Date().toLocaleString('zh-CN')}`);
    console.log(`💡 提示: 请检查脚本运行状态`);
    
    await page.screenshot({ path: "renew-error.png" });
    await browser.close();
    process.exit(2);
  }
})();
