import { createPinia } from 'pinia';
import { createApp } from 'vue';
import App from './App.vue';
import { router } from './router';
import './styles/main.css';

const app = createApp(App).use(createPinia()).use(router);

// Wait for the initial route (incl. query like ?edit=1) to resolve before
// mounting, so screens read the correct route in onMounted on a full page load.
void router.isReady().then(() => app.mount('#app'));
