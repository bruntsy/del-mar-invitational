import { createRouter, createWebHistory } from 'vue-router';
import HomeScreen from '@/components/screens/HomeScreen.vue';

export const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'home',
      component: HomeScreen,
    },
  ],
});
