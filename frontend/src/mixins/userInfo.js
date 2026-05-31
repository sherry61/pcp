import { mapState } from 'vuex';

export default {
  computed: {
    ...mapState(['username', 'userId'])
  }
};