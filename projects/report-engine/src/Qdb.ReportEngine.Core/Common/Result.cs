namespace Qdb.ReportEngine.Core.Common;

/// <summary>
/// Outcome of an operation that can fail without throwing. Per the clean-code standard,
/// the engine returns <see cref="Result{T}"/> rather than <c>null</c> to signal failure.
/// </summary>
/// <typeparam name="T">The success value type.</typeparam>
public readonly struct Result<T>
{
    private readonly T? _value;

    private Result(bool isSuccess, T? value, DomainError? error)
    {
        IsSuccess = isSuccess;
        _value = value;
        Error = error;
    }

    /// <summary>True when the operation succeeded and <see cref="Value"/> is available.</summary>
    public bool IsSuccess { get; }

    /// <summary>The error describing the failure, or <c>null</c> on success.</summary>
    public DomainError? Error { get; }

    /// <summary>The success value. Throws if accessed on a failed result.</summary>
    public T Value => IsSuccess
        ? _value!
        : throw new InvalidOperationException("Cannot read Value of a failed Result.");

    /// <summary>Creates a successful result carrying <paramref name="value"/>.</summary>
    public static Result<T> Success(T value) => new(true, value, null);

    /// <summary>Creates a failed result carrying <paramref name="error"/>.</summary>
    public static Result<T> Failure(DomainError error) => new(false, default, error);
}
