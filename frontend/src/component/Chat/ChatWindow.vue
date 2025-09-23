<template>
  <div class="chat-window" ref="chatWindow">
    <div v-if="!currentRecipientId" class="empty">
      Выберите пользователя, чтобы начать переписку
    </div>
    <div v-else class="messages">
      <MessageBubble
        v-for="msg in messageStore.messages"
        :key="msg.id"
        :message="msg"
        :isMine="msg.senderId === userStore.currentUser?.id"
      />
    </div>
  </div>
</template>


<script setup lang="ts">
import { onMounted, watch, nextTick, ref, computed } from 'vue'
import { useMessageStore } from '@/store/message'
import { useUserStore } from '@/store/user'
import MessageBubble from './MessageBubble.vue'

const chatWindow = ref<HTMLElement | null>(null)
const messageStore = useMessageStore()
const userStore    = useUserStore()

const currentRecipientId = computed(() => messageStore.currentRecipientId)

// при монтировании, если уже есть выбранный чат, загрузить его
onMounted(async () => {
  if (currentRecipientId.value) {
    await messageStore.startDialog(currentRecipientId.value)
  }
})

// при каждой смене получателя — заново инициализировать диалог
watch(currentRecipientId, async (newId, oldId) => {
  if (newId && newId !== oldId) {
    await messageStore.startDialog(newId)
  }
})

// скролл вниз при каждом новом сообщении
watch(
  () => messageStore.messages.length,
  async () => {
    await nextTick()
    if (chatWindow.value) {
      chatWindow.value.scrollTop = chatWindow.value.scrollHeight
    }
  }
)
</script>



<style scoped>
.chat-window {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
  display: flex;
  flex-direction: column;
  background: #222428;
}

.empty {
  margin: auto;
  color: #aaa;
  font-size: 1.2em;
  text-align: center;
}

.messages {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
</style>
