<template>
  <div class="flex h-full flex-col items-center justify-center gap-3">
    <div class="text-primary/15 text-[26vh] leading-none font-bold select-none">404</div>
    <p class="text-muted-foreground text-xl">Oops. Nothing here...</p>
    <Button as-child class="mt-6">
      <RouterLink to="/">Go Home</RouterLink>
    </Button>
  </div>
</template>

<script setup lang="ts">
import { RouterLink } from 'vue-router';
import { Button } from '@/components/ui/button';
</script>
