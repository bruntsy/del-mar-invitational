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
    {
      path: '/group',
      name: 'group',
      component: () => import('@/components/screens/GroupScreen.vue'),
    },
    {
      path: '/setup',
      name: 'setup',
      component: () => import('@/components/screens/SetupScreen.vue'),
    },
    {
      path: '/scorecard',
      name: 'scorecard',
      component: () => import('@/components/screens/ScorecardScreen.vue'),
    },
    {
      path: '/results',
      name: 'results',
      component: () => import('@/components/screens/ResultsScreen.vue'),
    },
  ],
});
