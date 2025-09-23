<template>
  <div :class="['bubble-wrapper', isMine ? 'mine' : 'theirs']">
    <div class="bubble">
      <div class="header">
        <img class="avatar" :src="message.senderAvatar || defaultAvatar"/>
        <span class="name">{{ message.senderName }}</span>
      </div>
      <div class="content">{{ message.decryptedContent || '[Зашифровано]' }}</div>
      <div class="time">{{ formatTime(message.createdAt) }}</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type {MessageDto} from '@/types/Message'
import defaultAvatar from '@/assets/default-avatar.png'
import {formatTime} from '@/utils/date'

defineProps<{
  message: MessageDto & {
    decryptedContent?: string
    createdAt?: string
  }
  isMine: boolean
}>()

</script>

<style scoped>
.bubble-wrapper {
  display: flex;
  flex-direction: column;
  max-width: 70%;
}

.bubble-wrapper.mine {
  align-self: flex-end;
  text-align: right;
}

.bubble-wrapper.theirs {
  align-self: flex-start;
  text-align: left;
}

.bubble {
  background-color: #2b2d31;
  border-radius: 12px;
  padding: 10px 14px;
  color: white;
  position: relative;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.4);
}

.header {
  display: flex;
  align-items: center;
  margin-bottom: 4px;
}

.avatar {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  margin-right: 8px;
}

.name {
  font-weight: bold;
  font-size: 0.9em;
}

.content {
  font-size: 1em;
  margin: 4px 0;
}

.time {
  font-size: 0.75em;
  color: #bbb;
  margin-top: 4px;
}
</style>
