import { defineBoot } from '#q-app';
import { vLazyImg } from '../composables/vLazyImg';

export default defineBoot(({ app }) => {
  app.directive('lazy-img', vLazyImg);
});
