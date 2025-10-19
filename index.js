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

    // === 调试：查看页面结构 ===
    console.log("🔍 开始查找服务器卡片...");
    
    // 保存页面HTML用于调试
    await page.screenshot({ path: "dashboard-debug.png", fullPage: true });
    
    // 尝试多种选择器
    const selector1 = await page.$('div.server-card');
    console.log(`方法1 - 找到 ${selector1.length} 个 server-card`);
    
    const selector2 = await page.$('a.btn:has-text("Manage")');
    console.log(`方法2 - 找到 ${selector2.length} 个 Manage 按钮`);
    
    const selector3 = await page.$('a[href*="server"]');
    console.log(`方法3 - 找到 ${selector3.length} 个包含server的链接`);
    
    const selector4 = await page.$('.server-actions a');
    console.log(`方法4 - 找到 ${selector4.length} 个 server-actions 中的链接`);
    
    // 使用最宽松的选择器
    const manageButtons = await page.$('a.btn:has-text("Manage")');
    const serverCount = manageButtons.length;
    console.log(`\n✅ 最终使用: 找到 ${serverCount} 个服务器`);

    if (serverCount === 0) {
      console.log("⚠️ 未找到任何服务器");
      await browser.close();
      process.exit(1);
    }

    // 用于统计结果
    const results = [];
    let successCount = 0;
    let failCount = 0;

    // === 循环处理每个服务器 ===
    for (let i = 0; i < serverCount; i++) {
      console.log(`\n${'='.repeat(60)}`);
      console.log(`处理第 ${i + 1}/${serverCount} 个服务器`);
      console.log('='.repeat(60));

      try {
        // 重新回到dashboard获取最新的按钮列表
        await page.goto(HOME_URL, { waitUntil: "networkidle" });
        await page.waitForTimeout(3000);

        const currentManageButtons = await page.$('a.btn:has-text("Manage")');
        
        if (i >= currentManageButtons.length) {
          console.log(`⚠️ 第 ${i + 1} 个服务器按钮不存在，跳过`);
          continue;
        }

        // 点击对应的Manage按钮
        await Promise.all([
          currentManageButtons[i].click(),
          page.waitForNavigation({ waitUntil: "networkidle", timeout: 15000 })
        ]);
        
        console.log("✅ 成功进入服务器管理页");

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
          console.log(`⏰ 续期前时间: ${beforeHours} 小时`);
          console.log(`⏰ 续期后时间: ${afterHours} 小时`);
          console.log(`🔄 增加时间: ${afterHours - beforeHours} 小时`);
          console.log(`🚀 服务器状态: ${serverStarted ? '已启动' : '已在运行'}`);
          
          results.push({
            index: i + 1,
            serverId,
            success: true,
            beforeHours,
            afterHours,
            addedHours: afterHours - beforeHours,
            serverStarted
          });
          successCount++;
        } else {
          console.log("⚠️ 续期可能失败，累计时间未增加");
          console.log(`💡 提示: 累计时间未增加，可能还没到续期时间`);
          
          results.push({
            index: i + 1,
            serverId,
            success: false,
            beforeHours,
            afterHours,
            serverStarted
          });
          failCount++;
        }

      } catch (err) {
        console.error(`❌ 处理第 ${i + 1} 个服务器时出错：`, err.message);
        results.push({
          index: i + 1,
          serverId: 'unknown',
          success: false,
          error: err.message
        });
        failCount++;
        
        await page.screenshot({ path: `renew-error-server-${i + 1}.png` });
      }
    }

    // === 输出汇总结果 ===
    console.log(`\n${'='.repeat(60)}`);
    console.log('📊 续期任务完成汇总');
    console.log('='.repeat(60));
    console.log(`总服务器数: ${serverCount}`);
    console.log(`成功续期: ${successCount}`);
    console.log(`失败/未到期: ${failCount}`);
    console.log(`完成时间: ${new Date().toLocaleString('zh-CN')}`);
    console.log('\n详细结果:');
    
    results.forEach(result => {
      console.log(`\n服务器 #${result.index} (ID: ${result.serverId})`);
      if (result.success) {
        console.log(`  ✅ 续期成功`);
        console.log(`  ⏰ ${result.beforeHours}h → ${result.afterHours}h (+${result.addedHours}h)`);
        console.log(`  🚀 ${result.serverStarted ? '已启动' : '已在运行'}`);
      } else if (result.error) {
        console.log(`  ❌ 处理出错: ${result.error}`);
      } else {
        console.log(`  ⚠️ 未续期 (当前: ${result.beforeHours}h)`);
        console.log(`  💡 可能还没到续期时间`);
      }
    });

    await browser.close();
    
    // 根据结果设置退出码
    if (successCount > 0) {
      console.log("\n✅ 至少有一个服务器续期成功");
      process.exit(0);
    } else if (failCount === serverCount) {
      console.log("\n⚠️ 所有服务器都未能续期");
      process.exit(3);
    } else {
      process.exit(0);
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
