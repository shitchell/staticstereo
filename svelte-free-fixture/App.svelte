<!--
  The component the two relative imports in this directory point at, and the
  file `src/svelte-free.test.ts`'s component clause must find. Nothing compiles
  it; it exists to be a `.svelte` path on disk.
-->
<script lang="ts">
  let { label }: { label: string } = $props()
</script>

<p>{label}</p>
