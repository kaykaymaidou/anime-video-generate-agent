import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { StoryboardEditor } from "@/components/Storyboard/StoryboardEditor";

export function StoryboardPage() {
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>分镜编辑器</CardTitle>
          <CardDescription>横向拖拽排序 + Prompt 在线编辑（@dnd-kit）</CardDescription>
        </CardHeader>
        <CardContent>
          <ScrollArea className="w-full whitespace-nowrap">
            <StoryboardEditor />
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}

