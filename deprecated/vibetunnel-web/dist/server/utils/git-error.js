"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isGitError = isGitError;
exports.createGitError = createGitError;
exports.isGitNotFoundError = isGitNotFoundError;
exports.isNotGitRepositoryError = isNotGitRepositoryError;
exports.isGitConfigNotFoundError = isGitConfigNotFoundError;
/**
 * Type guard to check if an error is a GitError
 */
function isGitError(error) {
    return (error instanceof Error &&
        (typeof error.code === 'string' ||
            typeof error.stderr === 'string' ||
            typeof error.exitCode === 'number'));
}
/**
 * Create a GitError from an unknown error
 */
function createGitError(error, context) {
    const gitError = new Error(context
        ? `${context}: ${error instanceof Error ? error.message : String(error)}`
        : error instanceof Error
            ? error.message
            : String(error));
    if (error instanceof Error) {
        // Copy standard Error properties
        gitError.stack = error.stack;
        gitError.name = error.name;
        // Copy Git-specific properties if they exist
        const errorWithProps = error;
        if (typeof errorWithProps.code === 'string') {
            gitError.code = errorWithProps.code;
        }
        if (typeof errorWithProps.stderr === 'string') {
            gitError.stderr = errorWithProps.stderr;
        }
        else if (errorWithProps.stderr && typeof errorWithProps.stderr === 'object') {
            // Handle Buffer or other objects that can be converted to string
            gitError.stderr = String(errorWithProps.stderr);
        }
        if (typeof errorWithProps.exitCode === 'number') {
            gitError.exitCode = errorWithProps.exitCode;
        }
    }
    return gitError;
}
/**
 * Check if a GitError indicates the git command was not found
 */
function isGitNotFoundError(error) {
    return isGitError(error) && error.code === 'ENOENT';
}
/**
 * Check if a GitError indicates we're not in a git repository
 */
function isNotGitRepositoryError(error) {
    return isGitError(error) && (error.stderr?.includes('not a git repository') ?? false);
}
/**
 * Check if a GitError is due to a missing config key
 */
function isGitConfigNotFoundError(error) {
    return isGitError(error) && error.exitCode === 5;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZ2l0LWVycm9yLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vLi4vc3JjL3NlcnZlci91dGlscy9naXQtZXJyb3IudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7QUFZQSxnQ0FPQztBQUtELHdDQStCQztBQUtELGdEQUVDO0FBS0QsMERBRUM7QUFLRCw0REFFQztBQW5FRDs7R0FFRztBQUNILFNBQWdCLFVBQVUsQ0FBQyxLQUFjO0lBQ3ZDLE9BQU8sQ0FDTCxLQUFLLFlBQVksS0FBSztRQUN0QixDQUFDLE9BQVEsS0FBa0IsQ0FBQyxJQUFJLEtBQUssUUFBUTtZQUMzQyxPQUFRLEtBQWtCLENBQUMsTUFBTSxLQUFLLFFBQVE7WUFDOUMsT0FBUSxLQUFrQixDQUFDLFFBQVEsS0FBSyxRQUFRLENBQUMsQ0FDcEQsQ0FBQztBQUNKLENBQUM7QUFFRDs7R0FFRztBQUNILFNBQWdCLGNBQWMsQ0FBQyxLQUFjLEVBQUUsT0FBZ0I7SUFDN0QsTUFBTSxRQUFRLEdBQUcsSUFBSSxLQUFLLENBQ3hCLE9BQU87UUFDTCxDQUFDLENBQUMsR0FBRyxPQUFPLEtBQUssS0FBSyxZQUFZLEtBQUssQ0FBQyxDQUFDLENBQUMsS0FBSyxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUMsTUFBTSxDQUFDLEtBQUssQ0FBQyxFQUFFO1FBQ3pFLENBQUMsQ0FBQyxLQUFLLFlBQVksS0FBSztZQUN0QixDQUFDLENBQUMsS0FBSyxDQUFDLE9BQU87WUFDZixDQUFDLENBQUMsTUFBTSxDQUFDLEtBQUssQ0FBQyxDQUNSLENBQUM7SUFFZCxJQUFJLEtBQUssWUFBWSxLQUFLLEVBQUUsQ0FBQztRQUMzQixpQ0FBaUM7UUFDakMsUUFBUSxDQUFDLEtBQUssR0FBRyxLQUFLLENBQUMsS0FBSyxDQUFDO1FBQzdCLFFBQVEsQ0FBQyxJQUFJLEdBQUcsS0FBSyxDQUFDLElBQUksQ0FBQztRQUUzQiw2Q0FBNkM7UUFDN0MsTUFBTSxjQUFjLEdBQUcsS0FBMkMsQ0FBQztRQUNuRSxJQUFJLE9BQU8sY0FBYyxDQUFDLElBQUksS0FBSyxRQUFRLEVBQUUsQ0FBQztZQUM1QyxRQUFRLENBQUMsSUFBSSxHQUFHLGNBQWMsQ0FBQyxJQUFJLENBQUM7UUFDdEMsQ0FBQztRQUNELElBQUksT0FBTyxjQUFjLENBQUMsTUFBTSxLQUFLLFFBQVEsRUFBRSxDQUFDO1lBQzlDLFFBQVEsQ0FBQyxNQUFNLEdBQUcsY0FBYyxDQUFDLE1BQU0sQ0FBQztRQUMxQyxDQUFDO2FBQU0sSUFBSSxjQUFjLENBQUMsTUFBTSxJQUFJLE9BQU8sY0FBYyxDQUFDLE1BQU0sS0FBSyxRQUFRLEVBQUUsQ0FBQztZQUM5RSxpRUFBaUU7WUFDakUsUUFBUSxDQUFDLE1BQU0sR0FBRyxNQUFNLENBQUMsY0FBYyxDQUFDLE1BQU0sQ0FBQyxDQUFDO1FBQ2xELENBQUM7UUFDRCxJQUFJLE9BQU8sY0FBYyxDQUFDLFFBQVEsS0FBSyxRQUFRLEVBQUUsQ0FBQztZQUNoRCxRQUFRLENBQUMsUUFBUSxHQUFHLGNBQWMsQ0FBQyxRQUFRLENBQUM7UUFDOUMsQ0FBQztJQUNILENBQUM7SUFFRCxPQUFPLFFBQVEsQ0FBQztBQUNsQixDQUFDO0FBRUQ7O0dBRUc7QUFDSCxTQUFnQixrQkFBa0IsQ0FBQyxLQUFjO0lBQy9DLE9BQU8sVUFBVSxDQUFDLEtBQUssQ0FBQyxJQUFJLEtBQUssQ0FBQyxJQUFJLEtBQUssUUFBUSxDQUFDO0FBQ3RELENBQUM7QUFFRDs7R0FFRztBQUNILFNBQWdCLHVCQUF1QixDQUFDLEtBQWM7SUFDcEQsT0FBTyxVQUFVLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsTUFBTSxFQUFFLFFBQVEsQ0FBQyxzQkFBc0IsQ0FBQyxJQUFJLEtBQUssQ0FBQyxDQUFDO0FBQ3hGLENBQUM7QUFFRDs7R0FFRztBQUNILFNBQWdCLHdCQUF3QixDQUFDLEtBQWM7SUFDckQsT0FBTyxVQUFVLENBQUMsS0FBSyxDQUFDLElBQUksS0FBSyxDQUFDLFFBQVEsS0FBSyxDQUFDLENBQUM7QUFDbkQsQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbIi8qKlxuICogR2l0IGNvbW1hbmQgZXJyb3Igd2l0aCBhZGRpdGlvbmFsIGNvbnRleHRcbiAqL1xuZXhwb3J0IGludGVyZmFjZSBHaXRFcnJvciBleHRlbmRzIEVycm9yIHtcbiAgY29kZT86IHN0cmluZztcbiAgc3RkZXJyPzogc3RyaW5nO1xuICBleGl0Q29kZT86IG51bWJlcjtcbn1cblxuLyoqXG4gKiBUeXBlIGd1YXJkIHRvIGNoZWNrIGlmIGFuIGVycm9yIGlzIGEgR2l0RXJyb3JcbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGlzR2l0RXJyb3IoZXJyb3I6IHVua25vd24pOiBlcnJvciBpcyBHaXRFcnJvciB7XG4gIHJldHVybiAoXG4gICAgZXJyb3IgaW5zdGFuY2VvZiBFcnJvciAmJlxuICAgICh0eXBlb2YgKGVycm9yIGFzIEdpdEVycm9yKS5jb2RlID09PSAnc3RyaW5nJyB8fFxuICAgICAgdHlwZW9mIChlcnJvciBhcyBHaXRFcnJvcikuc3RkZXJyID09PSAnc3RyaW5nJyB8fFxuICAgICAgdHlwZW9mIChlcnJvciBhcyBHaXRFcnJvcikuZXhpdENvZGUgPT09ICdudW1iZXInKVxuICApO1xufVxuXG4vKipcbiAqIENyZWF0ZSBhIEdpdEVycm9yIGZyb20gYW4gdW5rbm93biBlcnJvclxuICovXG5leHBvcnQgZnVuY3Rpb24gY3JlYXRlR2l0RXJyb3IoZXJyb3I6IHVua25vd24sIGNvbnRleHQ/OiBzdHJpbmcpOiBHaXRFcnJvciB7XG4gIGNvbnN0IGdpdEVycm9yID0gbmV3IEVycm9yKFxuICAgIGNvbnRleHRcbiAgICAgID8gYCR7Y29udGV4dH06ICR7ZXJyb3IgaW5zdGFuY2VvZiBFcnJvciA/IGVycm9yLm1lc3NhZ2UgOiBTdHJpbmcoZXJyb3IpfWBcbiAgICAgIDogZXJyb3IgaW5zdGFuY2VvZiBFcnJvclxuICAgICAgICA/IGVycm9yLm1lc3NhZ2VcbiAgICAgICAgOiBTdHJpbmcoZXJyb3IpXG4gICkgYXMgR2l0RXJyb3I7XG5cbiAgaWYgKGVycm9yIGluc3RhbmNlb2YgRXJyb3IpIHtcbiAgICAvLyBDb3B5IHN0YW5kYXJkIEVycm9yIHByb3BlcnRpZXNcbiAgICBnaXRFcnJvci5zdGFjayA9IGVycm9yLnN0YWNrO1xuICAgIGdpdEVycm9yLm5hbWUgPSBlcnJvci5uYW1lO1xuXG4gICAgLy8gQ29weSBHaXQtc3BlY2lmaWMgcHJvcGVydGllcyBpZiB0aGV5IGV4aXN0XG4gICAgY29uc3QgZXJyb3JXaXRoUHJvcHMgPSBlcnJvciBhcyB1bmtub3duIGFzIFJlY29yZDxzdHJpbmcsIHVua25vd24+O1xuICAgIGlmICh0eXBlb2YgZXJyb3JXaXRoUHJvcHMuY29kZSA9PT0gJ3N0cmluZycpIHtcbiAgICAgIGdpdEVycm9yLmNvZGUgPSBlcnJvcldpdGhQcm9wcy5jb2RlO1xuICAgIH1cbiAgICBpZiAodHlwZW9mIGVycm9yV2l0aFByb3BzLnN0ZGVyciA9PT0gJ3N0cmluZycpIHtcbiAgICAgIGdpdEVycm9yLnN0ZGVyciA9IGVycm9yV2l0aFByb3BzLnN0ZGVycjtcbiAgICB9IGVsc2UgaWYgKGVycm9yV2l0aFByb3BzLnN0ZGVyciAmJiB0eXBlb2YgZXJyb3JXaXRoUHJvcHMuc3RkZXJyID09PSAnb2JqZWN0Jykge1xuICAgICAgLy8gSGFuZGxlIEJ1ZmZlciBvciBvdGhlciBvYmplY3RzIHRoYXQgY2FuIGJlIGNvbnZlcnRlZCB0byBzdHJpbmdcbiAgICAgIGdpdEVycm9yLnN0ZGVyciA9IFN0cmluZyhlcnJvcldpdGhQcm9wcy5zdGRlcnIpO1xuICAgIH1cbiAgICBpZiAodHlwZW9mIGVycm9yV2l0aFByb3BzLmV4aXRDb2RlID09PSAnbnVtYmVyJykge1xuICAgICAgZ2l0RXJyb3IuZXhpdENvZGUgPSBlcnJvcldpdGhQcm9wcy5leGl0Q29kZTtcbiAgICB9XG4gIH1cblxuICByZXR1cm4gZ2l0RXJyb3I7XG59XG5cbi8qKlxuICogQ2hlY2sgaWYgYSBHaXRFcnJvciBpbmRpY2F0ZXMgdGhlIGdpdCBjb21tYW5kIHdhcyBub3QgZm91bmRcbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGlzR2l0Tm90Rm91bmRFcnJvcihlcnJvcjogdW5rbm93bik6IGJvb2xlYW4ge1xuICByZXR1cm4gaXNHaXRFcnJvcihlcnJvcikgJiYgZXJyb3IuY29kZSA9PT0gJ0VOT0VOVCc7XG59XG5cbi8qKlxuICogQ2hlY2sgaWYgYSBHaXRFcnJvciBpbmRpY2F0ZXMgd2UncmUgbm90IGluIGEgZ2l0IHJlcG9zaXRvcnlcbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGlzTm90R2l0UmVwb3NpdG9yeUVycm9yKGVycm9yOiB1bmtub3duKTogYm9vbGVhbiB7XG4gIHJldHVybiBpc0dpdEVycm9yKGVycm9yKSAmJiAoZXJyb3Iuc3RkZXJyPy5pbmNsdWRlcygnbm90IGEgZ2l0IHJlcG9zaXRvcnknKSA/PyBmYWxzZSk7XG59XG5cbi8qKlxuICogQ2hlY2sgaWYgYSBHaXRFcnJvciBpcyBkdWUgdG8gYSBtaXNzaW5nIGNvbmZpZyBrZXlcbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGlzR2l0Q29uZmlnTm90Rm91bmRFcnJvcihlcnJvcjogdW5rbm93bik6IGJvb2xlYW4ge1xuICByZXR1cm4gaXNHaXRFcnJvcihlcnJvcikgJiYgZXJyb3IuZXhpdENvZGUgPT09IDU7XG59XG4iXX0=