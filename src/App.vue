<template>
  <TooltipProvider :delay-duration="150" :skip-delay-duration="300">
    <router-view />
    <ConfirmDialog />
    <Toaster position="bottom-right" :duration="4000" close-button rich-colors />
  </TooltipProvider>
</template>

<script setup lang="ts">
import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import ConfirmDialog from '@/components/ConfirmDialog.vue';
</script>
