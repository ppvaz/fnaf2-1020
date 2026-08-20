using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using CTFAK.CCN;
using CTFAK.CCN.Chunks.Frame;
using CTFAK.CCN.Chunks.Objects;
using CTFAK.FileReaders;
using CTFAK.MMFParser.EXE.Loaders.Events.Expressions;
using CTFAK.MMFParser.EXE.Loaders.Events.Parameters;

namespace CTFAK.Tools
{
    public class EventTextDumper : IFusionTool
    {
        public string Name => "Event Text Dumper";
        public int[] Progress => Array.Empty<int>();

        public void Execute(IFileReader reader)
        {
            GameData game = reader.getGameData();
            string output = Environment.GetEnvironmentVariable("CTFAK_EVENT_DUMP") ?? "events.txt";
            using var writer = new StreamWriter(output, false);

            writer.WriteLine($"GAME\t{Clean(game.name)}\tBUILD\t{game.productBuild}\tFRAMES\t{game.frames.Count}");
            writer.WriteLine("OBJECTS");
            foreach (var pair in game.frameitems.OrderBy(item => item.Key))
            {
                ObjectInfo info = pair.Value;
                string values = "";
                string strings = "";
                if (info.properties is ObjectCommon common)
                {
                    if (common.Values != null)
                        values = string.Join(",", common.Values.Items);
                    if (common.Strings != null)
                        strings = string.Join("|", common.Strings.Items.Select(Clean));
                }
                writer.WriteLine($"OBJECT\t{pair.Key}\tTYPE\t{info.ObjectType}\tNAME\t{Clean(info.name)}\tVALUES\t{values}\tSTRINGS\t{strings}");
            }

            for (int frameIndex = 0; frameIndex < game.frames.Count; frameIndex++)
            {
                Frame frame = game.frames[frameIndex];
                int groupCount = frame.events?.Items.Count ?? 0;
                writer.WriteLine($"FRAME\t{frameIndex}\t{Clean(frame.name)}\tGROUPS\t{groupCount}");
                if (frame.events == null) continue;

                for (int groupIndex = 0; groupIndex < frame.events.Items.Count; groupIndex++)
                {
                    EventGroup group = frame.events.Items[groupIndex];
                    writer.WriteLine($"GROUP\t{groupIndex}\tFLAGS\t{group.Flags}\tRESTRICT\t{group.IsRestricted}\tCONDS\t{group.Conditions.Count}\tACTS\t{group.Actions.Count}");
                    foreach (Condition condition in group.Conditions)
                        writer.WriteLine($" C\tOT\t{condition.ObjectType}\tNUM\t{condition.Num}\tOI\t{condition.ObjectInfo}\tNAME\t{ObjectName(game, condition.ObjectInfo)}\tOIL\t{condition.ObjectInfoList}\tCFLAGS\t{condition.Flags}\tCOTHER\t{condition.OtherFlags}\tPARAMS\t{Parameters(condition.Items)}");
                    foreach (CTFAK.CCN.Chunks.Frame.Action action in group.Actions)
                        writer.WriteLine($" A\tOT\t{action.ObjectType}\tNUM\t{action.Num}\tOI\t{action.ObjectInfo}\tNAME\t{ObjectName(game, action.ObjectInfo)}\tOIL\t{action.ObjectInfoList}\tPARAMS\t{Parameters(action.Items)}");
                }
            }
            Console.WriteLine($"Event text written to {output}");
        }

        private static string ObjectName(GameData game, int handle)
        {
            return game.frameitems.TryGetValue(handle, out ObjectInfo info) ? Clean(info.name) : "";
        }

        private static string Parameters(IEnumerable<Parameter> parameters)
        {
            return string.Join(" || ", parameters.Select(parameter =>
            {
                if (parameter.Loader is ExpressionParameter expression)
                    return $"{parameter.Code}:ExpressionParameter:{Expression(expression)}";
                string rendered;
                try { rendered = parameter.Loader?.ToString() ?? "null"; }
                catch { rendered = "<render-error>"; }
                return $"{parameter.Code}:{Clean(parameter.Loader?.GetType().Name)}:{Clean(rendered)}";
            }));
        }

        private static string Expression(ExpressionParameter expression)
        {
            string items = string.Join(" ; ", expression.Items.Select((item, index) =>
            {
                string value = "null";
                if (item.Loader is ExpressionLoader loader)
                    value = Clean(loader.Value?.ToString());
                else if (item.Loader != null)
                    value = Clean(item.Loader.ToString());
                return $"[{index}]ot={item.ObjectType},num={item.Num},oi={item.ObjectInfo},oil={item.ObjectInfoList},loader={Clean(item.Loader?.GetType().Name)},value={value}";
            }));
            return $"cmp={expression.GetOperator()} {items}";
        }

        private static string Clean(string value)
        {
            return (value ?? "").Replace("\r", " ").Replace("\n", " ").Replace("\t", " ");
        }
    }
}
