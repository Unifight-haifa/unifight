import base from '../../content/site.json';
import contact from '../../content/site/contact.json';
import footer from '../../content/site/footer.json';
import hero from '../../content/site/hero.json';
import images from '../../content/site/images.json';
import pages from '../../content/site/pages.json';
import ui from '../../content/site/ui.json';

// site.json plus the small files the panel edits, as one object
export const site = { ...base, contact, hero, footer, ui, images, pages };

// contact.phones[0] is the club's WhatsApp and tel number
const p0 = contact.phones[0];
const local = p0.phone.replace(/^0/, '');
if (p0.tel.replace(/\D/g, '') !== `972${local.replace(/\D/g, '')}`) throw new Error(`content/site/contact.json: phones[0] phone ${p0.phone} and tel ${p0.tel} disagree`);
export const phone = { tel: p0.tel, display: p0.phone, wa: `https://wa.me/${p0.tel.replace(/\D/g, '')}`, ld: `+972-${local}` };
