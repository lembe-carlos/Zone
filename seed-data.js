'use strict';
// Catalogue d'exemple (marqué « demo » : supprimable depuis l'admin)
const PRODUCTS_SEED = [
  { id:1, image:"images/catalog/product-1.svg", name:{ fr:"iPhone 15 Pro Max", en:"iPhone 15 Pro Max", ar:"آيفون 15 بروز ماكس" }, cat:"electronics", emoji:"📱", price:14999, oldPrice:16999, rating:4.8, tag:"new", stock:24 },
  { id:2, image:"images/catalog/product-2.svg", name:{ fr:"Samsung Galaxy S24 Ultra", en:"Samsung Galaxy S24 Ultra", ar:"سامسونج جالكسي S24 ألتراء" }, cat:"electronics", emoji:"📲", price:13500, oldPrice:15000, rating:4.7, tag:"hot", stock:18 },
  { id:3, image:"images/catalog/product-3.svg", name:{ fr:"MacBook Pro 16\"", en:"MacBook Pro 16\"", ar:"ماك بوك بروز 16 بوصة" }, cat:"electronics", emoji:"💻", price:24999, oldPrice:28000, rating:4.9, tag:"new", stock:11 },
  { id:4, image:"images/catalog/product-4.svg", name:{ fr:"Dell XPS 15", en:"Dell XPS 15", ar:"دال إكس بي إس 15" }, cat:"electronics", emoji:"🖥️", price:18500, oldPrice:20000, rating:4.6, tag:null, stock:15 },
  { id:5, image:"images/catalog/product-5.svg", name:{ fr:"AirPods Pro 2", en:"AirPods Pro 2", ar:"إيرشبودز بروز 2" }, cat:"accessories", emoji:"🎧", price:2499, oldPrice:2999, rating:4.8, tag:"sale", stock:42 },
  { id:6, image:"images/catalog/product-6.svg", name:{ fr:"Sony WH-1000XM5", en:"Sony WH-1000XM5", ar:"سوني WH-1000XM5" }, cat:"accessories", emoji:"🎵", price:3199, oldPrice:3800, rating:4.7, tag:"sale", stock:29 },
  { id:7, image:"images/catalog/product-7.svg", name:{ fr:"Adobe Creative Suite (1 an)", en:"Adobe Creative Suite (1 yr)", ar:"أدوبي كريتيف سوت (سنة)" }, cat:"digital", emoji:"🎨", price:4999, oldPrice:6500, rating:4.5, tag:"digital", stock:999 },
  { id:8, image:"images/catalog/product-8.svg", name:{ fr:"Microsoft 365 Personnel", en:"Microsoft 365 Personal", ar:"ميكروسوفت 365 شخصي" }, cat:"digital", emoji:"📊", price:999, oldPrice:1200, rating:4.6, tag:"digital", stock:999 },
  { id:9, image:"images/catalog/product-9.svg", name:{ fr:"Antivirus Premium (2 ans)", en:"Antivirus Premium (2 yrs)", ar:"مجادد فيروسات بريميوم (سنتين)" }, cat:"digital", emoji:"🛡️", price:599, oldPrice:950, rating:4.4, tag:"digital", stock:999 },
  { id:10, image:"images/catalog/product-10.svg", name:{ fr:"Webcam 4K Ultra HD", en:"Webcam 4K Ultra HD", ar:"ويب كام 4K فائق الوضوح" }, cat:"accessories", emoji:"📸", price:1899, oldPrice:2200, rating:4.3, tag:null, stock:33 },
  { id:11, image:"images/catalog/product-11.svg", name:{ fr:"Clavier Mécanique RGB", en:"RGB Mechanical Keyboard", ar:"كيبورد ميكانيكي RGB" }, cat:"accessories", emoji:"⌨️", price:1299, oldPrice:1600, rating:4.5, tag:"sale", stock:37 },
  { id:12, image:"images/catalog/product-12.svg", name:{ fr:"Stockage Cloud 2TB (1 an)", en:"Cloud Storage 2TB (1 yr)", ar:"تخزين سحابي 2 تيرابايت" }, cat:"digital", emoji:"☁️", price:349, oldPrice:500, rating:4.2, tag:"digital", stock:999 },
];

const TRAINING_SEED = [
  { id:101, image:"images/catalog/training-101.svg", name:{ fr:"Marketing Digital Mastery", en:"Digital Marketing Mastery", ar:"إتقان التسويق الرقمي" }, emoji:"📣", lessons:{ fr:"24 leçons • 12h", en:"24 lessons • 12h", ar:"24 درس • 12 ساعة" }, desc:{ fr:"Maîtrisez le SEO, les réseaux sociaux et la publicité en ligne.", en:"Master SEO, social media and online advertising.", ar:"أتقن SEO والتسويق الرقمي والإعلان عبر الإنترنت." }, price:2499, oldPrice:4999, color:"#7c3aed", stock:999 },
  { id:102, image:"images/catalog/training-102.svg", name:{ fr:"Développement Web Full Stack", en:"Full Stack Web Development", ar:"تطوير الويب الشامل" }, emoji:"👨‍💻", lessons:{ fr:"48 leçons • 30h", en:"48 lessons • 30h", ar:"48 درس • 30 ساعة" }, desc:{ fr:"HTML, CSS, JavaScript, React, Node.js et bases de données.", en:"HTML, CSS, JavaScript, React, Node.js and databases.", ar:"HTML, CSS, JavaScript, React, Node.js والقواعد." }, price:3999, oldPrice:7999, color:"#0891b2", stock:999 },
  { id:103, image:"images/catalog/training-103.svg", name:{ fr:"Design UI/UX Professionnel", en:"Professional UI/UX Design", ar:"تصميم واجهة المستخدم المحترف" }, emoji:"🎨", lessons:{ fr:"32 leçons • 18h", en:"32 lessons • 18h", ar:"32 درس • 18 ساعة" }, desc:{ fr:"Figma, Prototyping, Recherche utilisateur et systèmes de design.", en:"Figma, Prototyping, User research and design systems.", ar:"فيجما والنموذج والبحث وأنظمة التصميم." }, price:2999, oldPrice:5999, color:"#e11d48", stock:999 },
  { id:104, image:"images/catalog/training-104.svg", name:{ fr:"Intelligence Artificielle Pratique", en:"Practical Artificial Intelligence", ar:"الذكاء الاصطناعي العملي" }, emoji:"🤖", lessons:{ fr:"36 leçons • 22h", en:"36 lessons • 22h", ar:"36 درس • 22 ساعة" }, desc:{ fr:"Python, Machine Learning, ChatGPT et automatisation avec IA.", en:"Python, Machine Learning, ChatGPT and AI automation.", ar:"بايثون والتعلم الآلي وتشات جي بي تي والأتمتة." }, price:3499, oldPrice:6999, color:"#16a34a", stock:999 },
  { id:105, image:"images/catalog/training-105.svg", name:{ fr:"E-Commerce & Dropshipping", en:"E-Commerce & Dropshipping", ar:"التجارة الإلكترونية والدروب شيبنغ" }, emoji:"🏪", lessons:{ fr:"28 leçons • 16h", en:"28 lessons • 16h", ar:"28 درس • 16 ساعة" }, desc:{ fr:"Créez et gérez une boutique en ligne rentable rapidement.", en:"Create and manage a profitable online store quickly.", ar:"أنشئ وأدر متجراً إلكترونياً مربحاً بسرعة." }, price:1999, oldPrice:3999, color:"#d97706", stock:999 },
  { id:106, image:"images/catalog/training-106.svg", name:{ fr:"Cybersécurité Fondamentaux", en:"Cybersecurity Fundamentals", ar:"أساسيات الأمن السيبراني" }, emoji:"🔐", lessons:{ fr:"20 leçons • 14h", en:"20 lessons • 14h", ar:"20 درس • 14 ساعة" }, desc:{ fr:"Protégez vos systèmes contre les cyberattaques modernes.", en:"Protect your systems against modern cyberattacks.", ar:"حمّل أنظمتك من الهجمات الإلكترونية الحديثة." }, price:2199, oldPrice:4499, color:"#dc2626", stock:999 },
];

const PROMO_SEED = [
  { code:"CARLOS20",  discount:0.20, label:{ fr:"20% de réduction appliquée!", en:"20% discount applied!" } },
  { code:"TECH10",    discount:0.10, label:{ fr:"10% de réduction appliquée!", en:"10% discount applied!" } },
  { code:"WELCOME15", discount:0.15, label:{ fr:"15% de réduction pour nouveau client!", en:"15% off for new customer!" } },
  { code:"DIGITAL30", discount:0.30, label:{ fr:"30% sur les produits digitaux!", en:"30% off digital products!" } },
  { code:"TRAIN50",   discount:0.50, label:{ fr:"50% sur les formations!", en:"50% off training!" } },
];

module.exports = { PRODUCTS_SEED, TRAINING_SEED, PROMO_SEED };
