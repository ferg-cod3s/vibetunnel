<script lang="ts">
  import { onMount } from "svelte";

  let searchQuery = "";
  let searchResults: Array<{
    title: string;
    description: string;
    url: string;
    type: string;
  }> = [];
  let isSearching = false;
  let showResults = false;
  let searchInput: HTMLInputElement;

  // Mock search data - in a real app, this would come from an API or search index
  const searchData = [
    {
      title: "Installation Guide",
      description:
        "Get TunnelForge running on your system with step-by-step instructions",
      url: "/installation",
      type: "Guide",
    },
    {
      title: "Getting Started",
      description: "Create your first terminal session and learn the basics",
      url: "/getting-started",
      type: "Tutorial",
    },
    {
      title: "CLI Reference",
      description: "Complete command-line interface documentation",
      url: "/cli-reference",
      type: "Reference",
    },
    {
      title: "Web Interface",
      description: "Using the browser-based terminal interface",
      url: "/web-interface",
      type: "Guide",
    },
  ];

  function performSearch(query: string) {
    if (query.length < 2) {
      searchResults = [];
      showResults = false;
      return;
    }

    isSearching = true;

    // Simulate search delay
    setTimeout(() => {
      const results = searchData.filter(
        (item) =>
          item.title.toLowerCase().includes(query.toLowerCase()) ||
          item.description.toLowerCase().includes(query.toLowerCase())
      );

      searchResults = results;
      showResults = true;
      isSearching = false;
    }, 300);
  }

  function handleSearchInput() {
    performSearch(searchQuery);
  }

  function handleResultClick(url: string) {
    window.location.href = url;
    showResults = false;
    searchQuery = "";
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === "Escape") {
      showResults = false;
      searchInput?.blur();
    }
  }

  onMount(() => {
    // Add global click listener to close search results
    document.addEventListener("click", (event) => {
      if (
        !event.target ||
        !(event.target as Element).closest(".search-container")
      ) {
        showResults = false;
      }
    });
  });
</script>

<div class="search-container">
  <div class="search-input-wrapper">
    <input
      bind:this={searchInput}
      bind:value={searchQuery}
      on:input={handleSearchInput}
      on:keydown={handleKeydown}
      type="search"
      placeholder="Search documentation..."
      class="search-input"
      aria-label="Search documentation"
    />
    {#if isSearching}
      <div class="search-spinner">🔍</div>
    {:else}
      <div class="search-icon">🔍</div>
    {/if}
  </div>

  {#if showResults && searchResults.length > 0}
    <div class="search-results">
      {#each searchResults as result}
        <div
          class="search-result"
          on:click={() => handleResultClick(result.url)}
          role="button"
          tabindex="0"
        >
          <div class="result-header">
            <span class="result-type">{result.type}</span>
          </div>
          <div class="result-content">
            <h4 class="result-title">{result.title}</h4>
            <p class="result-description">{result.description}</p>
          </div>
        </div>
      {/each}
    </div>
  {:else if showResults && searchQuery.length >= 2}
    <div class="search-results">
      <div class="no-results">
        <p>No results found for "{searchQuery}"</p>
        <p>Try different keywords or check your spelling.</p>
      </div>
    </div>
  {/if}
</div>

<style>
  .search-container {
    position: relative;
    max-width: 600px;
    margin: 0 auto;
  }

  .search-input-wrapper {
    position: relative;
    display: flex;
    align-items: center;
  }

  .search-input {
    width: 100%;
    padding: 1rem 3rem 1rem 1rem;
    border: 2px solid #e5e7eb;
    border-radius: 12px;
    font-size: 1.125rem;
    background-color: white;
    transition: all 0.2s ease;
    outline: none;
  }

  .search-input:focus {
    border-color: #3b82f6;
    box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
  }

  .search-icon,
  .search-spinner {
    position: absolute;
    right: 1rem;
    font-size: 1.25rem;
    color: #9ca3af;
    pointer-events: none;
  }

  .search-spinner {
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    from {
      transform: rotate(0deg);
    }
    to {
      transform: rotate(360deg);
    }
  }

  .search-results {
    position: absolute;
    top: 100%;
    left: 0;
    right: 0;
    background-color: white;
    border: 1px solid #e5e7eb;
    border-radius: 12px;
    box-shadow:
      0 20px 25px -5px rgba(0, 0, 0, 0.1),
      0 10px 10px -5px rgba(0, 0, 0, 0.04);
    max-height: 400px;
    overflow-y: auto;
    z-index: 1000;
    margin-top: 0.5rem;
  }

  .search-result {
    padding: 1rem;
    border-bottom: 1px solid #f3f4f6;
    cursor: pointer;
    transition: background-color 0.2s ease;
  }

  .search-result:last-child {
    border-bottom: none;
  }

  .search-result:hover {
    background-color: #f9fafb;
  }

  .search-result:focus {
    outline: 2px solid #3b82f6;
    outline-offset: -2px;
  }

  .result-header {
    margin-bottom: 0.5rem;
  }

  .result-type {
    font-size: 0.75rem;
    font-weight: 600;
    color: #6b7280;
    background-color: #f3f4f6;
    padding: 0.25rem 0.5rem;
    border-radius: 0.375rem;
    text-transform: uppercase;
  }

  .result-title {
    margin: 0 0 0.25rem 0;
    font-size: 1rem;
    font-weight: 600;
    color: #1f2937;
  }

  .result-description {
    margin: 0;
    font-size: 0.875rem;
    color: #6b7280;
    line-height: 1.4;
  }

  .no-results {
    padding: 2rem;
    text-align: center;
    color: #6b7280;
  }

  .no-results p {
    margin: 0.5rem 0;
  }

  @media (max-width: 768px) {
    .search-input {
      font-size: 1rem;
      padding: 0.875rem 2.5rem 0.875rem 0.875rem;
    }

    .search-results {
      max-height: 300px;
    }
  }
</style>
