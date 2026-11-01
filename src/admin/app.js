import { config } from './api.js';

if (!config()) document.getElementById('notice').hidden = false;
