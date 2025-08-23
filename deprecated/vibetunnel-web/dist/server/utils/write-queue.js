"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.WriteQueue = void 0;
/**
 * Simple queue for serializing async write operations
 */
class WriteQueue {
    constructor() {
        this.queue = Promise.resolve();
    }
    enqueue(writeFn) {
        this.queue = this.queue
            .then(() => writeFn())
            .catch((error) => {
            // Log but don't break the queue
            console.error('WriteQueue error:', error);
        });
    }
    /**
     * Wait for all queued operations to complete
     */
    async drain() {
        await this.queue;
    }
}
exports.WriteQueue = WriteQueue;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoid3JpdGUtcXVldWUuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi9zcmMvc2VydmVyL3V0aWxzL3dyaXRlLXF1ZXVlLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7OztBQUFBOztHQUVHO0FBQ0gsTUFBYSxVQUFVO0lBQXZCO1FBQ1UsVUFBSyxHQUFHLE9BQU8sQ0FBQyxPQUFPLEVBQUUsQ0FBQztJQWlCcEMsQ0FBQztJQWZDLE9BQU8sQ0FBQyxPQUFtQztRQUN6QyxJQUFJLENBQUMsS0FBSyxHQUFHLElBQUksQ0FBQyxLQUFLO2FBQ3BCLElBQUksQ0FBQyxHQUFHLEVBQUUsQ0FBQyxPQUFPLEVBQUUsQ0FBQzthQUNyQixLQUFLLENBQUMsQ0FBQyxLQUFLLEVBQUUsRUFBRTtZQUNmLGdDQUFnQztZQUNoQyxPQUFPLENBQUMsS0FBSyxDQUFDLG1CQUFtQixFQUFFLEtBQUssQ0FBQyxDQUFDO1FBQzVDLENBQUMsQ0FBQyxDQUFDO0lBQ1AsQ0FBQztJQUVEOztPQUVHO0lBQ0gsS0FBSyxDQUFDLEtBQUs7UUFDVCxNQUFNLElBQUksQ0FBQyxLQUFLLENBQUM7SUFDbkIsQ0FBQztDQUNGO0FBbEJELGdDQWtCQyIsInNvdXJjZXNDb250ZW50IjpbIi8qKlxuICogU2ltcGxlIHF1ZXVlIGZvciBzZXJpYWxpemluZyBhc3luYyB3cml0ZSBvcGVyYXRpb25zXG4gKi9cbmV4cG9ydCBjbGFzcyBXcml0ZVF1ZXVlIHtcbiAgcHJpdmF0ZSBxdWV1ZSA9IFByb21pc2UucmVzb2x2ZSgpO1xuXG4gIGVucXVldWUod3JpdGVGbjogKCkgPT4gUHJvbWlzZTx2b2lkPiB8IHZvaWQpOiB2b2lkIHtcbiAgICB0aGlzLnF1ZXVlID0gdGhpcy5xdWV1ZVxuICAgICAgLnRoZW4oKCkgPT4gd3JpdGVGbigpKVxuICAgICAgLmNhdGNoKChlcnJvcikgPT4ge1xuICAgICAgICAvLyBMb2cgYnV0IGRvbid0IGJyZWFrIHRoZSBxdWV1ZVxuICAgICAgICBjb25zb2xlLmVycm9yKCdXcml0ZVF1ZXVlIGVycm9yOicsIGVycm9yKTtcbiAgICAgIH0pO1xuICB9XG5cbiAgLyoqXG4gICAqIFdhaXQgZm9yIGFsbCBxdWV1ZWQgb3BlcmF0aW9ucyB0byBjb21wbGV0ZVxuICAgKi9cbiAgYXN5bmMgZHJhaW4oKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgYXdhaXQgdGhpcy5xdWV1ZTtcbiAgfVxufVxuIl19