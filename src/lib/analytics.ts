// unset Actions variables expand to '', which means analytics is off
const id: string = import.meta.env.PUBLIC_GA_ID || '';
// the ID is pasted into an inline script, so only the documented shape gets through
if (id && !/^G-[A-Z0-9]+$/.test(id)) throw new Error(`PUBLIC_GA_ID must look like G-XXXXXXX, got "${id}"`);

export const GA_ID = id;
