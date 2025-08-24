<script lang="ts">
  export let title: string;
  export let description: string;
  export let icon: string;
  export let href: string | undefined = undefined;
</script>

{#if href}
  <a {href} class="feature-card">
    <div class="icon">{icon}</div>
    <h3>{title}</h3>
    <p>{description}</p>
  </a>
{:else}
  <div class="feature-card">
    <div class="icon">{icon}</div>
    <h3>{title}</h3>
    <p>{description}</p>
  </div>
{/if}

<style>
  .feature-card {
    background: white;
    border-radius: 12px;
    padding: 1.5rem;
    box-shadow:
      0 4px 6px -1px rgba(0, 0, 0, 0.1),
      0 2px 4px -1px rgba(0, 0, 0, 0.06);
    transition: all 0.3s ease;
    text-decoration: none;
    color: inherit;
    display: block;
    border: 1px solid #e5e7eb;
  }

  .feature-card:hover {
    transform: translateY(-4px);
    box-shadow:
      0 20px 25px -5px rgba(0, 0, 0, 0.1),
      0 10px 10px -5px rgba(0, 0, 0, 0.04);
    border-color: #3b82f6;
  }

  .icon {
    font-size: 2rem;
    margin-bottom: 1rem;
    display: block;
  }

  h3 {
    margin: 0 0 0.5rem 0;
    font-size: 1.25rem;
    font-weight: 600;
    color: #1f2937;
  }

  p {
    margin: 0;
    color: #6b7280;
    line-height: 1.5;
  }
</style>
