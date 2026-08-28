// Gộp chữ Hán PHỒN THỂ về GIẢN THỂ — bước nắn quan trọng nhất của sổ tay báo giá.
//
// VÌ SAO CẦN
// Đối tác Đài Loan viết phồn thể, nhưng cùng một dịch vụ vẫn lẫn cả hai lối viết
// (bản đối tác tự gõ, bản chép từ web Việt Nam, bản đối tác khác gửi lại). Đo
// trên máy chủ thật: `similarity('下龍灣遊船', '下龙湾游船') = 0,09` — hai chuỗi
// CÙNG NGHĨA, CÙNG CHỮ, chỉ khác lối viết, mà máy chấm gần như bằng 0. Trong khi
// một cặp SAI HẲN (`哈龍灣遊船`, khác vịnh) lại được 0,33.
//
// Tức là nếu không nắn thì mọi ngưỡng giống-nhau đều vô nghĩa: cái sai điểm cao
// hơn cái đúng. Nắn xong thì hai chuỗi trên trùng khít, thành một khoá.
//
// VÌ SAO KHÔNG KÉO THƯ VIỆN
// Bộ chuyển phồn↔giản đầy đủ nặng vài trăm KB và kèm cả chuyển từ vựng vùng miền
// (滑鼠→鼠標...) — thứ ta KHÔNG muốn, vì nó đổi cả tên riêng. Ở đây chỉ cần gộp
// ký tự, một-đối-một, và chỉ trong phạm vi chữ thật sự xuất hiện.
//
// PHẠM VI: dựng từ 558 chữ Hán đo được trong dữ liệu thật (báo giá cũ + bộ nhớ
// khớp + tên tiếng Trung của khách sạn/nhà hàng), cộng thêm từ vựng du lịch hay
// gặp. Thiếu chữ nào thì chữ đó giữ nguyên — chỉ mất cơ hội khớp, KHÔNG khớp sai.

/**
 * Cặp phồn→giản, viết liền: vị trí chẵn là phồn thể, vị trí lẻ là giản thể.
 *
 * Viết liền thay vì bảng đối tượng để mắt soát được theo cặp và để test tự kiểm
 * được (độ dài chẵn, không chữ nào tự map về chính nó, không trùng khoá).
 */
const CAP_PHON_GIAN =
  // ── chữ trong dữ liệu thật ──
  "亞亚來来個个倫伦傳传儀仪內内劇剧劍剑動动務务匯汇區区參参單单嚴严國国園园" +
  "圖图場场壽寿奧奥媽妈實实寧宁寶宝寢寝將将層层峴岘島岛廚厨廟庙廠厂廣广廳厅" +
  "張张強强悅悦態态慶庆憶忆應应戲戏捲卷數数於于時时暢畅會会東东楊杨樂乐樓楼" +
  "標标樹树橋桥機机殼壳為为溫温漁渔灣湾無无煙烟燈灯燒烧爾尔獨独獵猎瑤瑶瓊琼" +
  "當当療疗發发監监簡简籠笼紅红紐纽級级統统絲丝經经綢绸線线緣缘緻致總总纜缆" +
  "聲声臥卧華华蓮莲薦荐藍蓝蘭兰號号蝦虾術术見见親亲覺觉覽览觀观記记訝讶請请" +
  "議议護护豐丰貝贝貢贡費费賓宾贈赠車车軟软輝辉輪轮農农進进遊游選选還还邊边" +
  "郵邮鄉乡釣钓銀银鋒锋錢钱鍋锅鎮镇鐘钟鐵铁長长門门間间閭闾陳陈陸陆陽阳際际" +
  "隻只雙双雞鸡雲云電电靈灵靜静頂顶順顺領领頭头題题風风飛飞飯饭飲饮飽饱餅饼" +
  "館馆騰腾驗验驚惊體体魚鱼鮭鲑鮮鲜鯉鲤鱧鳢鳳凤鴨鸭鵑鹃鵡鹉鸚鹦麗丽麵面黃黄" +
  "點点龍龙龜龟莊庄" +
  // ── từ vựng du lịch / ăn ở / đi lại hay gặp, phòng cho lịch trình sau ──
  "導导藝艺們们這这買买賣卖開开關关問问學学讓让說说話话語语讀读寫写聽听課课" +
  "過过遠远連连運运達达適适銅铜鋼钢鵝鹅雜杂離离難难韓韩須须預预顏颜願愿類类" +
  "顧顾顯显飄飘養养餘余馬马駕驾髮发鬧闹鳥鸟麼么齊齐齒齿帶带幣币幫帮師师庫库" +
  "廢废彈弹徹彻慮虑憂忧戰战擔担據据擇择擊击擴扩攝摄敵敌斷断書书條条業业極极" +
  "構构樣样檢检歐欧歲岁歷历歸归殺杀氣气準准溝沟滿满漢汉潔洁濟济濱滨烏乌熱热" +
  "營营牆墙獎奖環环產产畢毕異异盡尽盤盘眾众碼码確确礦矿禮礼種种積积稱称穩稳" +
  "競竞筆笔節节範范築筑籃篮籌筹簽签粵粤糧粮約约紀纪純纯紙纸細细終终組组結结" +
  "給给綠绿維维網网緊紧練练縣县繼继續续纖纤罰罚羅罗義义習习職职聯联腦脑臉脸" +
  "臨临舉举舊旧艙舱蘇苏蟲虫補补裝装製制複复訂订計计討讨訓训訪访設设許许訴诉" +
  "診诊註注評评詞词試试詩诗該该詳详認认誌志誠诚誰谁調调談谈論论講讲謝谢證证" +
  "識识責责貨货質质購购賽赛趕赶軍军輕轻轉转遲迟遺遗醫医釋释針针鈴铃鉛铅銷销" +
  "鋪铺錄录錦锦鍵键鎖锁鏡镜鑑鉴閉闭閩闽閱阅隊队階阶隨随隱隐頁页鬥斗黨党";

/** phồn → giản, dựng một lần lúc nạp module. */
const BANG: ReadonlyMap<string, string> = (() => {
  const m = new Map<string, string>();
  for (let i = 0; i < CAP_PHON_GIAN.length; i += 2) {
    m.set(CAP_PHON_GIAN[i], CAP_PHON_GIAN[i + 1]);
  }
  return m;
})();

/** Số cặp đang phủ — để test kiểm và để màn quản lý hiện được con số. */
export const SO_CAP_PHON_GIAN = BANG.size;

/** Chuỗi thô, chỉ dùng cho test tự kiểm cấu trúc. */
export const _CAP_PHON_GIAN_THO = CAP_PHON_GIAN;

/**
 * Gộp mọi chữ phồn thể trong chuỗi về giản thể. Chữ không có trong bảng thì giữ
 * nguyên — thiếu chữ chỉ làm mất cơ hội khớp, không bao giờ gây khớp sai.
 *
 * Bắt buộc idempotent: `f(f(x)) === f(x)`, vì kết quả được lưu xuống DB làm khoá.
 * Điều này đúng vì không chữ giản thể nào lại là khoá của một cặp khác.
 */
export function gianHoa(s: string): string {
  let ra = "";
  for (const c of s) ra += BANG.get(c) ?? c;
  return ra;
}
