using Qdb.ReportEngine.Execution.Dataverse;
using Xunit;

namespace Qdb.ReportEngine.Tests;

public sealed class ODataParsingTests
{
    [Fact]
    public void ReadValueRows_ParsesAliasesAndFormattedAnnotations()
    {
        const string json = """
        {"@odata.context":"x","value":[
          {"group":1,"group@OData.Community.Display.V1.FormattedValue":"Active","value":100},
          {"group":2,"group@OData.Community.Display.V1.FormattedValue":"Closed","value":42}
        ]}
        """;

        var rows = ODataJson.ReadValueRows(json);

        Assert.Equal(2, rows.Count);
        Assert.Equal("Active", rows[0]["group@OData.Community.Display.V1.FormattedValue"]);
        Assert.Equal(100L, rows[0]["value"]);
        Assert.Equal(2L, rows[1]["group"]);
    }

    [Fact]
    public void ReadValueRows_NoValueArray_ReturnsEmpty()
    {
        var rows = ODataJson.ReadValueRows("""{"@odata.context":"x"}""");

        Assert.Empty(rows);
    }

    [Fact]
    public void BuildRequestBody_EmitsOneGetPerUrlWithClosingDelimiter()
    {
        var body = ODataBatch.BuildRequestBody("batch_1", ["api/data/v9.2/accounts?fetchXml=a", "api/data/v9.2/contacts?fetchXml=b"]);

        Assert.Equal(2, CountOccurrences(body, "GET "));
        Assert.Contains("--batch_1\r\n", body);
        Assert.Contains("GET api/data/v9.2/accounts?fetchXml=a HTTP/1.1", body);
        Assert.EndsWith("--batch_1--\r\n", body);
    }

    [Fact]
    public void SplitResponseBodies_ExtractsJsonPayloadsInOrder()
    {
        const string boundary = "batchresponse_x";
        var response =
            $"--{boundary}\r\n" +
            "Content-Type: application/http\r\nContent-Transfer-Encoding: binary\r\n\r\n" +
            "HTTP/1.1 200 OK\r\nContent-Type: application/json; odata.metadata=minimal\r\n\r\n" +
            "{\"value\":[{\"group\":\"Doha\",\"value\":100}]}\r\n" +
            $"--{boundary}\r\n" +
            "Content-Type: application/http\r\nContent-Transfer-Encoding: binary\r\n\r\n" +
            "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\n\r\n" +
            "{\"value\":[{\"value\":3}]}\r\n" +
            $"--{boundary}--\r\n";

        var bodies = ODataBatch.SplitResponseBodies(boundary, response);

        Assert.Equal(2, bodies.Count);
        Assert.Equal(100L, ODataJson.ReadValueRows(bodies[0])[0]["value"]);
        Assert.Equal(3L, ODataJson.ReadValueRows(bodies[1])[0]["value"]);
    }

    private static int CountOccurrences(string haystack, string needle)
    {
        var count = 0;
        var index = 0;
        while ((index = haystack.IndexOf(needle, index, System.StringComparison.Ordinal)) >= 0)
        {
            count++;
            index += needle.Length;
        }

        return count;
    }
}
