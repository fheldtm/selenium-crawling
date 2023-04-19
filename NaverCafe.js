const fs = require('fs');
const webdriver = require('selenium-webdriver');
const { By } = require('selenium-webdriver');
const chrome = require('selenium-webdriver/chrome');
const options = new chrome.Options();
options.addArguments('headless');
options.addArguments('disable-gpu');

let driver, last_article_id;
const MAX_PRICE = 700000;
const MIN_PRICE = 150000;
const FILTER_TITLE_LIST = [
  '삽니다',
]

const getNaverCafeAritlceId = url => {
  const match = url.match(/articleid=(\d+)/i);
  return match ? match[1] : null;
}

const findLastArticleId = () => {
  const content = fs.readFileSync('./.last_article_id.txt', 'utf8')
  last_article_id = content.split('=')[1];
}

const startCafe = async () => {
  try {
    driver = new webdriver.Builder()
      .forBrowser('chrome')
      .setChromeOptions(options)
      .build();

    await driver.get('https://cafe.naver.com/joonggonara');

    await driver.findElement(By.id('menuLink433')).click();
    const iframe_container = await driver.findElement(By.id('cafe_main'));

    await driver.switchTo().frame(iframe_container);

    await driver.findElement(By.css('.sort_card')).click();
  } catch(err) {
    console.error(err);
  }
}

const total_items = [];
const findCafeArticle = async (page = 1) => {
  try {
    await driver.findElement(By.xpath(`//div[@class='prev-next']//a[text()='${page}']`)).click();

    const articles = await driver.findElements(By.css('.article-movie-sub li'));
    let items = await Promise.all(
      articles
        .map(async (article) => {
          const article_id = getNaverCafeAritlceId(await article.findElement(By.css('.con_top .tit_area a.tit')).getAttribute('href'));
          const title = await article.findElement(By.css('.con_top .tit_area strong')).getText();
          const price = (await article.findElement(By.css('span.price em')).getText()).replace(/[,]/g, '');
          const time = await article.findElement(By.css('.user_info .date_num .date')).getText();
          let status;
          try {
            await article.findElement(By.css('span.list-i-sellout'))
            status = 0;
          } catch(err) {
            status = 1;
          }
          return { article_id, title, price, time, status };
        })
    );

    // 종료하는 article id 보다 작은 id 가 있는지 확인
    const is_terminate_article = items.some(({ article_id }) => Number(article_id) <= Number(last_article_id));
    
    items = items
      .filter(({ article_id }) => article_id != null && Number(last_article_id) < Number(article_id)) // last_article_id 와 비교해서 필터링
      .filter(({ price }) => price <= MAX_PRICE && price >= MIN_PRICE)
      .filter(({ title }) => !FILTER_TITLE_LIST.some(keyword => new RegExp(keyword, 'g').test(title)))

    // total_items에 해당 item들 추가
    items.forEach(obj => total_items.push(obj));

    // article_id 비교해서 최근 아이디보다 작은 게시글이 있을 경우 종료
    if (is_terminate_article) {
      const maxId = Math.max(...total_items.map(({ article_id }) => Number(article_id)));
      // 종료 전에 last_article_id.txt 업데이트
      fs.writeFileSync('./last_article_id.txt', `article=${maxId}`, 'utf-8')

      // total_items 파일에 저장
      const text = total_items
        .map(({ article_id, title, price, time, status }) => {
          return [
            `게시글 ID: ${article_id}`,
            `제목: ${title}`,
            `가격: ${price}`,
            `일시: ${new Date().toISOString().slice(0,10)} ${time}`,
            `상태: ${status}`,
            `바로가기: https://cafe.naver.com/joonggonara/${article_id}`,
            '',
            `--------`
          ].join('\n')
        })
        .join('\n\n');
      fs.writeFileSync('./result/total_items.txt', text, 'utf-8')

      // 종료
      driver.quit();
    } else {
      // 다음 페이지 찾기
      findCafeArticle(page + 1);
    }
  } catch(err) {
    console.error(err);
  }
}

(async () => {
  findLastArticleId();
  await startCafe();
  findCafeArticle();
})();