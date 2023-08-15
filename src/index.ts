import { Context, Schema, Logger, h } from 'koishi'
import puppeteer, { Browser, Page } from "puppeteer-core"
import crypto from 'crypto'
import find from 'puppeteer-finder'

export const name = 'my-answer-book'
export const logger = new Logger('答案之书')
export const usage = `## 📝 命令

本插件提供了以下两个指令：

- \`answerBook\`：显示本插件的指令帮助。
- \`翻开答案之书\`：翻开答案之书，获取你心中问题的答案。你可以在配置项中设置答案的模式，包括图片模式和文本模式（中文、英文、中英文），并可以选择是否添加空格。

## 🎮 使用

- 在聊天窗口中，输入 \`answerBook\` 命令，查看帮助信息
- 输入 \`翻开答案之书\` 命令，翻开答案之书
- 在心中默念你的问题，等待答案之书给你答案
- 根据你的喜好，修改配置项，更改答案之书的返回结果`

export interface Config {
  sentText: any
  waitTime: number
  answerBookResultPattern: string
  isEnableImageCompression: boolean
  PictureQuality: number
}

export const Config: Schema<Config> = Schema.intersect([
  Schema.object({
    sentText: Schema.union([
      Schema.const('在心中默念你的问题，等待答案之书给你答案。').description('默认'),
      Schema.string().description('自定义'),
      Schema.const(false).description('不发送文本'),
    ]).description('触发指令后发送的文本'),
    waitTime: Schema.number().default(0).description('翻开答案之书后等待发送答案的时间'),
    answerBookResultPattern: Schema.union(['图片模式', '中文文本模式', '中文文本模式(带空格)', '英文(小写)文本模式', '英文(大写)文本模式', '中英文(小写)文本模式', '中英文(小写)文本模式(带空格)', '中英文(大写)文本模式', '中英文(大写)文本模式(带空格)']).description('答案之书返回结果的模式'),
    isEnableImageCompression: Schema.boolean().default(true).description('是否压缩图片'),
  }).description('基础配置'),
  Schema.union([
    Schema.object({
      isEnableImageCompression: Schema.const(true),
      PictureQuality: Schema.number().min(1).max(100).default(80).description('压缩后图片的质量(1-100)'),
    }),
    Schema.object({}),
  ])
]) as Schema<Config>

// puppeteer-finder模块可以查找本机安装的Chrome / Firefox / Edge浏览器
const executablePath = find();

export function apply(ctx: Context, config: Config) {
  // 注册命令
  registerCommands(ctx, config)
}

async function registerCommands(ctx: Context, config: Config) {
  // 消息

  //  answerBook openAnswerBook

  // answerBook
  ctx.command('answerBook', '答案之书帮助')
    .action(async ({ session }) => {
      await session.execute(`answerbook -h`)
    })

  // openAnswerBook
  ctx.command('answerBook/翻开答案之书', '翻开答案之书')
    .action(async ({ session }) => {
      if (config.sentText !== false) {
        await session.sendQueued(config.sentText)
      }
      // 随机生成 userAgent 字符串
      const userAgent = randomUserAgent();

      const result = await getAnswer(userAgent)

      async function wait(n: number) {
        // 使用Promise构造函数创建一个Promise对象，它会在n秒后resolve
        let promise = new Promise(resolve => {
          setTimeout(resolve, n * 1000); // n * 1000 是 n 秒的毫秒数
        });
        // 使用await关键字等待Promise对象的结果
        await promise;
      }

      await wait(config.waitTime)

      // 根据配置的答案模式返回不同的结果
      switch (config.answerBookResultPattern) {
        case '图片模式':
          return h.image(result.buffer, 'image/png')
        case '中文文本模式':
          return result.textObject.chineseText
        case '中文文本模式(带空格)':
          return addSpacesBetweenChineseCharacters(result.textObject.chineseText)
        case '英文(小写)文本模式':
          return result.textObject.englishText
        case '英文(大写)文本模式':
          return result.textObject.englishText.toUpperCase()
        case '中英文(小写)文本模式':
          return `${result.textObject.englishText}\n${result.textObject.chineseText}`
        case '中英文(小写)文本模式(带空格)':
          return `${result.textObject.englishText}\n${result.textObject.chineseText}`
        case '中英文(大写)文本模式':
          return `${result.textObject.englishText.toUpperCase()}\n${result.textObject.chineseText}`
        case '中英文(大写)文本模式(带空格)':
          return `${result.textObject.englishText.toUpperCase()}\n${addSpacesBetweenChineseCharacters(result.textObject.chineseText)}`
        default:
          return '无效的答案模式'
      }



      function addSpacesBetweenChineseCharacters(str: string): string {
        const pattern = /([\u4E00-\u9FFF])/g;
        return str.replace(pattern, '$1 ');
      }

      function randomBrowserVersion(): string {
        // 生成一个 2 字节的随机缓冲区
        const buffer = crypto.randomBytes(2);

        // 将缓冲区转换为无符号整数
        const number = buffer.readUInt16BE();

        // 使用第一个字节作为主要版本，第二个字节作为次要版本
        const major = number >> 8;
        const minor = number & 0xff;

        // 返回版本号字符串，格式为 major.minor.0.0
        return `${major}.${minor}.0.0`;
      }
      function randomUserAgent(): string {
        // 为基本用户代理字符串定义一个常量
        const base = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko)';

        // 使用 randomBrowserVersion 函数生成随机的 Chrome 版本号
        const chrome = `Chrome/${randomBrowserVersion()}`;

        // 使用 randomBrowserVersion 函数生成随机的Edge版本号
        const edge = `Edg/${randomBrowserVersion()}`;

        // 返回用户代理字符串，格式为基本 chrome safari edge
        return `${base} ${chrome} Safari/537.36 ${edge}`;
      }
      // 定义一个辅助函数来重试具有指数回退的函数
      async function retry<T>(
        func: () => Promise<T>,
        retries = 3,
        delay = 500,
      ): Promise<T> {
        let lastError: Error;
        for (let i = 0; i < retries; i++) {
          try {
            return await func();
          } catch (error) {
            // 定义一个函数，用于请求一言的 api
            async function requestHitokoto() {
              // 使用fetch方法来发送请求
              const response = await fetch('https://v1.hitokoto.cn/');
              // 判断响应是否成功
              if (response.ok) {
                // 解析响应为json格式
                const data = await response.json();
                // 返回一言的内容
                return data.hitokoto;
              } else {
                // 抛出错误信息
                throw new Error(`请求失败，状态码：${response.status}`);
              }
            }

            // 定义一个函数，用于显示提示词
            async function showTip() {
              try {
                // 调用 requestHitokoto 函数来获取一言
                // 使用重试函数来请求一言的 api
                const hitokoto = await retry(() => requestHitokoto());

                // 记录提示
                logger.error(hitokoto);
              } catch (error) {
                // 记录错误
                logger.error(error.message);
              }
            }
            await showTip();
            lastError = error;
            await new Promise((resolve) => setTimeout(resolve, delay * (2 ** i)));
          }
        }
        throw lastError;
      }
      // 定义一个异步函数，用于执行网页操作和截图
      async function getAnswer(
        userAgent: string,
      ) {
        // 使用重试函数访问页面
        async function gotoWithRetry(page: Page, url: string) {
          return retry(() => page.goto(url, { waitUntil: 'domcontentloaded' }));
        }
        try {
          // 创建一个新的页面
          const page = await browser.newPage();
          await page.setUserAgent(userAgent);
          await page.setViewport({ width: 1200, height: 800 });
          page.setDefaultNavigationTimeout(0);
          // 读取页面时不设置超时
          page.setDefaultTimeout(0);
          // 前往目标网页
          await gotoWithRetry(page, `https://www.myanswersbook.com/zh-cn.html`);
          // 等待页面加载完成
          // 获取 <a> 元素的位置和尺寸信息
          const bookBox = await page.$('a.book-box');
          const boxBoundingBox = await bookBox?.boundingBox();

          if (boxBoundingBox) {
            // 计算图像区域的中心坐标
            const centerX = boxBoundingBox.x + boxBoundingBox.width / 2;
            const centerY = boxBoundingBox.y + boxBoundingBox.height / 2;

            // 点击图像区域的中心坐标
            await page.mouse.click(centerX, centerY);
          } else {
            throw new Error('无法找到书本元素');
          }
          await page.waitForSelector('.content-en');

          let buffer: Buffer;
          if (config.answerBookResultPattern === '图片模式') {
            // 从页面中隐藏图像不需要的一些元素
            await page.evaluate(() => {
              const SELECTORS_TO_HIDE = [
                '.layui-layer-content.layui-layer-padding',
              ];
              SELECTORS_TO_HIDE.forEach((selector) => {
                const elements = document.querySelectorAll(selector);
                elements.forEach((element) => {
                  // 类型断言：element 作为 HTMLElement
                  (element as HTMLElement).style.display = 'none';
                });
              });
            });
            const element = await page.$('.content-box');
            // 获取元素的边界框
            const elementBox = await element.boundingBox();
            // 根据配置项设置图片质量
            if (config.isEnableImageCompression) {
              // 截取带有 clip 选项的元素的屏幕截图
              buffer = await element.screenshot({
                type: "jpeg",
                quality: config.PictureQuality,
                clip: elementBox,
              }) as Buffer;
            } else {
              // 截取带有 clip 选项的元素的屏幕截图
              buffer = await element.screenshot({
                type: "png",
                clip: elementBox,
              }) as Buffer;
            }
          }

          let textObject = {
            englishText: '',
            chineseText: ''
          };
          if (config.answerBookResultPattern !== '图片模式') {
            // 等待页面加载完成
            const elements = await page.$$('.content-en');
            for (let element of elements) {
              let text = await element.evaluate(el => el.textContent);
              let visible = await element.evaluate(el => (el as any).offsetWidth > 0 && (el as any).offsetHeight > 0 && el.textContent.trim() !== '');
              if (visible) {
                if (/[\u4e00-\u9fa5]+/.test(text)) {
                  textObject.chineseText = text;
                } else {
                  textObject.englishText = text;
                }
              }
            }



          }
          await page.close();
          // 返回buffer
          return { buffer, textObject };
        } catch (error) {
          // 如果发生错误，打印错误信息并重试
          logger.error(error);
        }
      }
    })

  // 定义一个无头浏览器实例
  let browser: Browser;

  // 启动浏览器实例
  async function launchBrowser() {
    browser = await puppeteer.launch({
      executablePath,
      headless: "new",
      // headless: false,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
  }

  // 关闭浏览器实例
  async function closeBrowser() {
    await browser.close();
  }

  // 在程序开始时启动浏览器实例
  launchBrowser();


  ctx.on('dispose', () => {
    // 在程序结束时关闭浏览器实例
    closeBrowser();
  })


}



