<template>
  <div class="chat-list">
    <!-- Поиск пользователей (класс searchUser оставлен без изменений) -->
    <input
      v-model="searchQuery"
      @input="onSearch"
      placeholder="Поиск пользователей..."
      class="searchUser"
    />

    <!-- Список пользователей с собственным скроллом -->
    <div class="users-list">
      <div
        v-for="user in filteredUsers"
        :key="user.id"
        :class="['chat-item', { active: user.id === selectedUserId }]"
        @click="selectUser(user.id)"
      >
        <img :src="user.avatarUrl || defaultAvatar" class="avatar" />
        <div class="info">
          <div class="name">{{ user.username }}</div>
          <div class="status">
            {{ user.online ? '🟢 В сети' : '🔴 Не в сети' }}
          </div>
        </div>
      </div>
    </div>

    <!-- Текущий пользователь приклеен к низу -->
    <div class="current-user">
      <span class="status-dot online"></span>
      {{ authStore.currentUser?.username || authStore.username }}
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useUserStore } from '@/store/user'
import { useMessageStore } from '@/store/message'
import { useAuthStore } from '@/store/auth'
import defaultAvatar from '@/assets/default-avatar.png'

const searchQuery = ref('')
const userStore   = useUserStore()
const messageStore   = useMessageStore()
const authStore   = useAuthStore()

const selectedUserId = computed(() => messageStore.currentRecipientId)

// Исключаем из списка себя и фильтруем по введённому запросу
const filteredUsers = computed(() =>
  userStore.users
    .filter(u => u.id !== authStore.currentUser?.id)
    .filter(u =>
      u.username.toLowerCase().includes(searchQuery.value.trim().toLowerCase())
    )
)

function onSearch() {
  userStore.fetchUsers(searchQuery.value)
}

async function selectUser(id: string) {
  // loadMessages установит currentRecipientId и загрузит историю
  // console.warn("test")
  await messageStore.startDialog(id)
}

onMounted(() => {
  userStore.fetchUsers('')  // сразу все пользователи
})
</script>

<style scoped>
.chat-list {
  display: flex;
  flex-direction: column;
  padding: 16px;
  height: 100%;       /* растянуть на весь контейнер */
  overflow: hidden;    /* убрать скролл у всей панели */
}

.users-list {
  flex: 1;             /* занять всё доступное место между input и блоком current-user */
  overflow-y: auto;    /* скролл только внутри списка */
}

.searchUser {
  display: flex;
  align-items: center;
  padding: 12px;
  background: #2a2c31;
  border-top: 1px solid #444;
}

.searchUser::placeholder {
  color: white;
  opacity: 1;
}
/* карточка пользователя */
.chat-item {
  display: flex;
  align-items: center;
  padding: 12px;
  border-radius: 10px;
  transition: background 0.2s;
  cursor: pointer;
  margin-bottom: 8px;
}
.chat-item.active {
  background-color: #484a4f;
}

/* аватар */
.avatar {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  margin-right: 12px;
}

/* инфо о пользователе */
.info {
  display: flex;
  flex-direction: column;
}
.name {
  font-weight: bold;
}
.status {
  font-size: 0.8em;
  color: #aaa;
}

/* блок текущего пользователя */
.current-user {
  padding: 12px 0 0;
  border-top: 1px solid #e5e5e5;
  display: flex;
  align-items: center;
}
.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  margin-right: 8px;
}
.status-dot.online {
  background-color: #4caf50;
}
</style>
