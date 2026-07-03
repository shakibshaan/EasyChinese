const fs = require('fs');
const text = `
=== LESSON 1: 你好 (Hello) ===

Front: 你好
Back: Pinyin: nǐ hǎo | English: hello | Lesson: 1

Front: 你
Back: Pinyin: nǐ | English: you (singular) | Lesson: 1

Front: 好
Back: Pinyin: hǎo | English: good, fine | Lesson: 1

Front: 您
Back: Pinyin: nín | English: you (polite) | Lesson: 1

Front: 你们
Back: Pinyin: nǐmen | English: you (plural) | Lesson: 1

Front: 对不起
Back: Pinyin: duìbuqǐ | English: to be sorry | Lesson: 1

Front: 没关系
Back: Pinyin: méi guānxi | English: that's OK, it doesn't matter | Lesson: 1


=== LESSON 2: 谢谢你 (Thank you) ===

Front: 谢谢
Back: Pinyin: xièxie | English: to thank | Lesson: 2

Front: 不
Back: Pinyin: bù | English: no, not | Lesson: 2

Front: 不客气
Back: Pinyin: bú kèqi | English: you're welcome, don't mention it | Lesson: 2

Front: 再见
Back: Pinyin: zàijiàn | English: to see you around, goodbye | Lesson: 2


=== LESSON 3: 你叫什么名字 (What's your name) ===

Front: 叫
Back: Pinyin: jiào | English: to call, to be called | Lesson: 3

Front: 什么
Back: Pinyin: shénme | English: what | Lesson: 3

Front: 名字
Back: Pinyin: míngzi | English: name | Lesson: 3

Front: 我
Back: Pinyin: wǒ | English: I, me | Lesson: 3

Front: 是
Back: Pinyin: shì | English: to be | Lesson: 3

Front: 老师
Back: Pinyin: lǎoshī | English: teacher | Lesson: 3

Front: 吗
Back: Pinyin: ma | English: question particle (used at end of questions) | Lesson: 3

Front: 学生
Back: Pinyin: xuésheng | English: student | Lesson: 3

Front: 人
Back: Pinyin: rén | English: human, person | Lesson: 3

Front: 中国
Back: Pinyin: Zhōngguó | English: China | Lesson: 3

Front: 美国
Back: Pinyin: Měiguó | English: United States of America | Lesson: 3


=== LESSON 4: 她是我的汉语老师 (She is my Chinese teacher) ===

Front: 她
Back: Pinyin: tā | English: she, her | Lesson: 4

Front: 谁
Back: Pinyin: shéi | English: who, whom | Lesson: 4

Front: 的
Back: Pinyin: de | English: possessive particle ('s) | Lesson: 4

Front: 汉语
Back: Pinyin: Hànyǔ | English: Chinese (language) | Lesson: 4

Front: 哪
Back: Pinyin: nǎ | English: which | Lesson: 4

Front: 国
Back: Pinyin: guó | English: country, nation | Lesson: 4

Front: 呢
Back: Pinyin: ne | English: interrogative particle | Lesson: 4

Front: 他
Back: Pinyin: tā | English: he, him | Lesson: 4

Front: 同学
Back: Pinyin: tóngxué | English: classmate | Lesson: 4

Front: 朋友
Back: Pinyin: péngyou | English: friend | Lesson: 4


=== LESSON 5: 她女儿今年二十岁 (Her daughter is 20 years old) ===

Front: 家
Back: Pinyin: jiā | English: family | Lesson: 5

Front: 有
Back: Pinyin: yǒu | English: to have, there be | Lesson: 5

Front: 口
Back: Pinyin: kǒu | English: measure word for family members | Lesson: 5

Front: 女儿
Back: Pinyin: nǚ'ér | English: daughter | Lesson: 5

Front: 几
Back: Pinyin: jǐ | English: how many | Lesson: 5

Front: 岁
Back: Pinyin: suì | English: year (of age) | Lesson: 5

Front: 了
Back: Pinyin: le | English: change particle (indicates change or new situation) | Lesson: 5

Front: 今年
Back: Pinyin: jīnnián | English: this year | Lesson: 5

Front: 多
Back: Pinyin: duō | English: degree/extent (how) | Lesson: 5

Front: 大
Back: Pinyin: dà | English: old (of age), big | Lesson: 5

Front: 一
Back: Pinyin: yī | English: one | Lesson: 5

Front: 二
Back: Pinyin: èr | English: two | Lesson: 5

Front: 三
Back: Pinyin: sān | English: three | Lesson: 5

Front: 四
Back: Pinyin: sì | English: four | Lesson: 5

Front: 五
Back: Pinyin: wǔ | English: five | Lesson: 5

Front: 六
Back: Pinyin: liù | English: six | Lesson: 5

Front: 七
Back: Pinyin: qī | English: seven | Lesson: 5

Front: 八
Back: Pinyin: bā | English: eight | Lesson: 5

Front: 九
Back: Pinyin: jiǔ | English: nine | Lesson: 5

Front: 十
Back: Pinyin: shí | English: ten | Lesson: 5


=== LESSON 6: 我会说汉语 (I can speak Chinese) ===

Front: 会
Back: Pinyin: huì | English: can, to be able to | Lesson: 6

Front: 说
Back: Pinyin: shuō | English: to speak, to say | Lesson: 6

Front: 妈妈
Back: Pinyin: māma | English: mother | Lesson: 6

Front: 菜
Back: Pinyin: cài | English: dish, cuisine | Lesson: 6

Front: 很
Back: Pinyin: hěn | English: very, quite | Lesson: 6

Front: 好吃
Back: Pinyin: hǎochī | English: delicious, tasty | Lesson: 6

Front: 做
Back: Pinyin: zuò | English: to make, to produce | Lesson: 6

Front: 写
Back: Pinyin: xiě | English: to write | Lesson: 6

Front: 汉字
Back: Pinyin: Hànzì | English: Chinese character | Lesson: 6

Front: 字
Back: Pinyin: zì | English: character, word | Lesson: 6

Front: 怎么
Back: Pinyin: zěnme | English: how | Lesson: 6

Front: 读
Back: Pinyin: dú | English: to read | Lesson: 6


=== LESSON 7: 今天几号 (What's the date today) ===

Front: 请
Back: Pinyin: qǐng | English: please (polite) | Lesson: 7

Front: 问
Back: Pinyin: wèn | English: to ask, to inquire | Lesson: 7

Front: 今天
Back: Pinyin: jīntiān | English: today | Lesson: 7

Front: 号
Back: Pinyin: hào | English: date (number), day of month | Lesson: 7

Front: 月
Back: Pinyin: yuè | English: month | Lesson: 7

Front: 星期
Back: Pinyin: xīngqī | English: week, day of week | Lesson: 7

Front: 昨天
Back: Pinyin: zuótiān | English: yesterday | Lesson: 7

Front: 明天
Back: Pinyin: míngtiān | English: tomorrow | Lesson: 7

Front: 去
Back: Pinyin: qù | English: to go | Lesson: 7

Front: 学校
Back: Pinyin: xuéxiào | English: school | Lesson: 7

Front: 看
Back: Pinyin: kàn | English: to look at, to watch, to read | Lesson: 7

Front: 书
Back: Pinyin: shū | English: book | Lesson: 7


=== LESSON 8: 我想喝茶 (I'd like some tea) ===

Front: 想
Back: Pinyin: xiǎng | English: to want, would like | Lesson: 8

Front: 喝
Back: Pinyin: hē | English: to drink | Lesson: 8

Front: 茶
Back: Pinyin: chá | English: tea | Lesson: 8

Front: 吃
Back: Pinyin: chī | English: to eat | Lesson: 8

Front: 米饭
Back: Pinyin: mǐfàn | English: cooked rice | Lesson: 8

Front: 下午
Back: Pinyin: xiàwǔ | English: afternoon | Lesson: 8

Front: 商店
Back: Pinyin: shāngdiàn | English: shop, store | Lesson: 8

Front: 买
Back: Pinyin: mǎi | English: to buy, to purchase | Lesson: 8

Front: 个
Back: Pinyin: gè | English: general measure word | Lesson: 8

Front: 杯子
Back: Pinyin: bēizi | English: cup, glass | Lesson: 8

Front: 这
Back: Pinyin: zhè | English: this | Lesson: 8

Front: 多少
Back: Pinyin: duōshao | English: how many, how much | Lesson: 8

Front: 钱
Back: Pinyin: qián | English: money | Lesson: 8

Front: 块
Back: Pinyin: kuài | English: unit of money (yuan) | Lesson: 8

Front: 那
Back: Pinyin: nà | English: that | Lesson: 8


=== LESSON 9: 你儿子在哪儿工作 (Where does your son work) ===

Front: 小
Back: Pinyin: xiǎo | English: small, little | Lesson: 9

Front: 猫
Back: Pinyin: māo | English: cat | Lesson: 9

Front: 在
Back: Pinyin: zài | English: to be in/on/at; in/on/at | Lesson: 9

Front: 那儿
Back: Pinyin: nàr | English: there | Lesson: 9

Front: 狗
Back: Pinyin: gǒu | English: dog | Lesson: 9

Front: 椅子
Back: Pinyin: yǐzi | English: chair | Lesson: 9

Front: 下面
Back: Pinyin: xiàmiàn | English: under, below | Lesson: 9

Front: 哪儿
Back: Pinyin: nǎr | English: where | Lesson: 9

Front: 工作
Back: Pinyin: gōngzuò | English: to work; job | Lesson: 9

Front: 儿子
Back: Pinyin: érzi | English: son | Lesson: 9

Front: 医院
Back: Pinyin: yīyuàn | English: hospital | Lesson: 9

Front: 医生
Back: Pinyin: yīshēng | English: doctor | Lesson: 9

Front: 爸爸
Back: Pinyin: bàba | English: father | Lesson: 9


=== LESSON 10: 我能坐这儿吗 (Can I sit here) ===

Front: 桌子
Back: Pinyin: zhuōzi | English: desk, table | Lesson: 10

Front: 上
Back: Pinyin: shàng | English: up, above, on | Lesson: 10

Front: 电脑
Back: Pinyin: diànnǎo | English: computer | Lesson: 10

Front: 和
Back: Pinyin: hé | English: and | Lesson: 10

Front: 本
Back: Pinyin: běn | English: measure word for books | Lesson: 10

Front: 里
Back: Pinyin: lǐ | English: inner, inside, interior | Lesson: 10

Front: 前面
Back: Pinyin: qiánmiàn | English: front | Lesson: 10

Front: 后面
Back: Pinyin: hòumiàn | English: back | Lesson: 10

Front: 这儿
Back: Pinyin: zhèr | English: here | Lesson: 10

Front: 没有
Back: Pinyin: méiyǒu | English: there is not, to not have | Lesson: 10

Front: 能
Back: Pinyin: néng | English: can, may | Lesson: 10

Front: 坐
Back: Pinyin: zuò | English: to sit, to be seated | Lesson: 10


=== LESSON 11: 现在几点 (What's the time now) ===

Front: 现在
Back: Pinyin: xiànzài | English: now | Lesson: 11

Front: 点
Back: Pinyin: diǎn | English: o'clock | Lesson: 11

Front: 分
Back: Pinyin: fēn | English: minute | Lesson: 11

Front: 中午
Back: Pinyin: zhōngwǔ | English: noon | Lesson: 11

Front: 吃饭
Back: Pinyin: chī fàn | English: to eat a meal | Lesson: 11

Front: 时候
Back: Pinyin: shíhou | English: time, moment | Lesson: 11

Front: 回
Back: Pinyin: huí | English: to come/go back, to return | Lesson: 11

Front: 我们
Back: Pinyin: wǒmen | English: we, us | Lesson: 11

Front: 电影
Back: Pinyin: diànyǐng | English: film, movie | Lesson: 11

Front: 住
Back: Pinyin: zhù | English: to live, to stay | Lesson: 11

Front: 前
Back: Pinyin: qián | English: before, earlier than | Lesson: 11

Front: 北京
Back: Pinyin: Běijīng | English: Beijing | Lesson: 11


=== LESSON 12: 明天天气怎么样 (What will the weather be like) ===

Front: 天气
Back: Pinyin: tiānqì | English: weather | Lesson: 12

Front: 怎么样
Back: Pinyin: zěnmeyàng | English: how (indicating condition) | Lesson: 12

Front: 太
Back: Pinyin: tài | English: too, excessively | Lesson: 12

Front: 热
Back: Pinyin: rè | English: hot | Lesson: 12

Front: 冷
Back: Pinyin: lěng | English: cold | Lesson: 12

Front: 下雨
Back: Pinyin: xià yǔ | English: to rain | Lesson: 12

Front: 小姐
Back: Pinyin: xiǎojiě | English: miss, young lady | Lesson: 12

Front: 来
Back: Pinyin: lái | English: to come | Lesson: 12

Front: 身体
Back: Pinyin: shēntǐ | English: body | Lesson: 12

Front: 爱
Back: Pinyin: ài | English: to like, to love | Lesson: 12

Front: 些
Back: Pinyin: xiē | English: some, a few | Lesson: 12

Front: 水果
Back: Pinyin: shuǐguǒ | English: fruit | Lesson: 12

Front: 水
Back: Pinyin: shuǐ | English: water | Lesson: 12


=== LESSON 13: 他在学做中国菜呢 (He is learning to cook Chinese food) ===

Front: 喂
Back: Pinyin: wèi | English: hello, hey (on phone) | Lesson: 13

Front: 也
Back: Pinyin: yě | English: also, too | Lesson: 13

Front: 学习
Back: Pinyin: xuéxí | English: to study, to learn | Lesson: 13

Front: 上午
Back: Pinyin: shàngwǔ | English: morning, before noon | Lesson: 13

Front: 睡觉
Back: Pinyin: shuì jiào | English: to sleep | Lesson: 13

Front: 电视
Back: Pinyin: diànshì | English: television | Lesson: 13

Front: 喜欢
Back: Pinyin: xǐhuān | English: to like, to be fond of | Lesson: 13

Front: 给
Back: Pinyin: gěi | English: to (preposition) | Lesson: 13

Front: 打电话
Back: Pinyin: dǎ diànhuà | English: to make a phone call | Lesson: 13

Front: 吧
Back: Pinyin: ba | English: suggestion particle | Lesson: 13

Front: 大卫
Back: Pinyin: Dàwèi | English: David | Lesson: 13


=== LESSON 14: 她买了不少衣服 (She has bought quite a few clothes) ===

Front: 东西
Back: Pinyin: dōngxi | English: thing, stuff | Lesson: 14

Front: 一点儿
Back: Pinyin: yīdiǎnr | English: a few, a little | Lesson: 14

Front: 苹果
Back: Pinyin: píngguǒ | English: apple | Lesson: 14

Front: 看见
Back: Pinyin: kànjiàn | English: to see | Lesson: 14

Front: 先生
Back: Pinyin: xiānsheng | English: Mr., sir | Lesson: 14

Front: 开
Back: Pinyin: kāi | English: to drive | Lesson: 14

Front: 车
Back: Pinyin: chē | English: car, vehicle | Lesson: 14

Front: 回来
Back: Pinyin: huílái | English: to come back | Lesson: 14

Front: 分钟
Back: Pinyin: fēnzhōng | English: minute | Lesson: 14

Front: 后
Back: Pinyin: hòu | English: after, afterwards, later | Lesson: 14

Front: 衣服
Back: Pinyin: yīfu | English: clothes | Lesson: 14

Front: 漂亮
Back: Pinyin: piàoliang | English: beautiful, pretty | Lesson: 14

Front: 啊
Back: Pinyin: a | English: modal particle (confirmation) | Lesson: 14

Front: 少
Back: Pinyin: shǎo | English: little, few | Lesson: 14

Front: 不少
Back: Pinyin: bùshǎo | English: quite a few, many | Lesson: 14

Front: 这些
Back: Pinyin: zhèxiē | English: these | Lesson: 14

Front: 都
Back: Pinyin: dōu | English: both, all | Lesson: 14

Front: 张
Back: Pinyin: Zhāng | English: Zhang (family name) | Lesson: 14


=== LESSON 15: 我是坐飞机来的 (I came here by air) ===

Front: 认识
Back: Pinyin: rènshi | English: to meet, to know | Lesson: 15

Front: 年
Back: Pinyin: nián | English: year | Lesson: 15

Front: 大学
Back: Pinyin: dàxué | English: college, university | Lesson: 15

Front: 饭店
Back: Pinyin: fàndiàn | English: hotel, restaurant | Lesson: 15

Front: 出租车
Back: Pinyin: chūzūchē | English: taxi, cab | Lesson: 15

Front: 一起
Back: Pinyin: yìqǐ | English: together | Lesson: 15

Front: 高兴
Back: Pinyin: gāoxìng | English: glad, happy | Lesson: 15

Front: 听
Back: Pinyin: tīng | English: to listen | Lesson: 15

Front: 飞机
Back: Pinyin: fēijī | English: airplane | Lesson: 15
`;

const lines = text.split('\n');
let out = [];
let currentWord = '';
for (let i = 0; i < lines.length; i++) {
  let line = lines[i].trim();
  if (line.startsWith('Front: ')) {
    currentWord = line.replace('Front: ', '').trim();
  } else if (line.startsWith('Back: ')) {
    let back = line.replace('Back: ', '');
    // Pinyin: nǐ hǎo | English: hello | Lesson: 1
    const match = back.match(/Pinyin: (.*) \| English: (.*) \| Lesson: (\d+)/);
    if (match) {
      const pinyin = match[1].trim();
      const meaning = match[2].trim();
      const lesson = match[3].trim();
      out.push(`${lesson},${currentWord},${pinyin},,${meaning}`); // added empty pos
    }
  }
}
fs.writeFileSync('src/data/hsk1.csv', out.join('\n'));
console.log("Done");
