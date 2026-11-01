import base from '../../content/site.json';
import contact from '../../content/site/contact.json';
import footer from '../../content/site/footer.json';
import hero from '../../content/site/hero.json';

// site.json plus the small files the panel edits, as one object
export const site = { ...base, contact, hero, footer };
