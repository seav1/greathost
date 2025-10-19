const EMAIL = process.env.EMAIL;
const PASSWORD = process.env.PASSWORD;

const { chromium } = require("playwright");

(async () => {
  const GREATHOST_URL = "https://greathost.es";
  const LOGIN_URL = `${GREATHOST_URL}/login`;
  const CONTRACTS_URL = `${GREATHOST_URL}/contracts`;

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

    // === 跳转到 contracts 页面 ===
    console.log("📄 打开合约页面：", CONTRACTS_URL);
    await page.goto(CONTRACTS_URL, { waitUntil: "networkidle" });
    await page.waitForTimeout(3000);

    // === 获取所有服务器ID ===
    console.log("🔍 查找所有服务器...");
    
    // 获取所有 View Details 链接
    const viewDetailsLinks = await page.$('a.btn-view[href*="/contracts/"]');
    console.log(`找到 ${viewDetailsLinks.length} 个服务器`);
    
    if (viewDetailsLinks.length === 0) {
      console.log("⚠️ 未找到任何服务器");
      await browser.close();
      process.exit(1);
    }
    
    // 提取所有服务器ID
    const serverIds = [];
    for (const link of viewDetailsLinks) {
      const href = await link.getAttribute('href');
      const match = href.match(/\/contracts\/([a-f0-9-]+)/);
      if (match) {
        serverIds.push(match[1]);
      }
    }
    
    console.log(`提取到 ${serverIds.length} 个服务器ID`);

    // 用于统计结果
    const results = [];
    let successCount = 0;
    let failCount = 0;

    // === 循环处理每个服务器 ===
    for (let i = 0; i < serverIds.length; i++) {
      const serverId = serverIds[i];
      
      console.log(`\n${'='.repeat(60)}`);
      console.log(`处理第 ${i + 1}/${serverIds.length} 个服务器`);
      console.log(`服务器ID: ${serverId}`);
      console.log('='.repeat(60));

      try {
        // === 检查并启动服务器 ===
        const consoleUrl = `https://greathost.es/server-console.html?id=${serverId}`;
        console.log("📄 打开控制台页面:", consoleUrl);
        await page.goto(consoleUrl, { waitUntil: "networkidle" });
        await page.waitForTimeout(2000);
        
        // 获取服务器状态
        let serverStatus = 'unknown';
        try {
          serverStatus = await page.$eval('span#server-status-detail', el => el.textContent.toLowerCase());
        } catch (e) {
          // 无法获取状态，继续
        }

        // 如果服务器离线则启动
        let serverStarted = false;
        if (serverStatus.includes('offline') || serverStatus.includes('stopping') || serverStatus.includes('stop')) {
          console.log("⚡ 服务器离线或停止中，尝试启动...");
          
          try {
            const startButton = await page.waitForSelector('button:has-text("Start")', { timeout: 5000 });
            await startButton.click();
            console.log("✅ 启动命令已发送");
            await page.waitForTimeout(5000);
            serverStarted = true;
          } catch (e) {
            // 未找到启动按钮或服务器已在运行
          }
        }

        // === 跳转到合约页面续期 ===
        const contractUrl = `https://greathost.es/contracts/${serverId}`;
        console.log("📄 打开合约续期页：", contractUrl);
        await page.goto(contractUrl, { waitUntil: "networkidle" });
        await page.waitForTimeout(2000);

        // === 获取续期前的时间 ===
        let beforeHours = 0;
        try {
          beforeHours = await page.$eval('#accumulated-time', el => parseInt(el.textContent));
          console.log(`当前累计时间: ${beforeHours} 小时`);
        } catch (e) {
          // 无法获取累计时间，尝试继续续期
        }

        // === 点击续期按钮 ===
        console.log("⚡ 尝试点击续期按钮...");
        
        // 尝试多种可能的按钮文本
        let renewClicked = false;
        const buttonTexts = ['续期', 'Renew', 'renew', 'RENEW'];
        
        for (const btnText of buttonTexts) {
          try {
            const btn = await page.waitForSelector(`button:has-text("${btnText}")`, { timeout: 2000 });
            await btn.click();
            console.log(`✅ 成功点击续期按钮 (${btnText})`);
            renewClicked = true;
            break;
          } catch (e) {
            // 继续尝试下一个
          }
        }
        
        if (!renewClicked) {
          throw new Error("未找到续期按钮");
        }

        // === 等待页面刷新并检查时间变化 ===
        await page.waitForTimeout(3000);
        
        let afterHours = beforeHours;
        try {
          afterHours = await page.$eval('#accumulated-time', el => parseInt(el.textContent));
          console.log(`续期后累计时间: ${afterHours} 小时`);
        } catch (e) {
          // 无法获取续期后时间
        }

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
          console.log("⚠️ 续期可能失败或累计时间未增加");
          console.log(`💡 提示: 可能还没到续期时间`);
          
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
          serverId,
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
    console.log(`总服务器数: ${serverIds.length}`);
    console.log(`成功续期: ${successCount}`);
    console.log(`失败/未到期: ${failCount}`);
    console.log(`完成时间: ${new Date().toLocaleString('zh-CN')}`);
    console.log('\n详细结果:');
    
    results.forEach(result => {
      console.log(`\n服务器 #${result.index}`);
      console.log(`  ID: ${result.serverId}`);
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
    } else if (failCount === serverIds.length) {
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
