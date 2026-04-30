import { render, fireEvent } from "@testing-library/react";
import { StoryboardEditor } from "../Storyboard/StoryboardEditor";
import { useStoryboardStore } from "@/store/storyboardStore";

describe("StoryboardEditor", () => {
  it("renders shots and allows prompt editing", () => {
    useStoryboardStore.setState({
      shots: [
        {
          id: "s1",
          order: 1,
          description: "",
          prompt: "hello",
          status: "pending",
          modelType: "seedance2.0"
        }
      ]
    } as any);

    const ui = render(<StoryboardEditor />);
    const textarea = ui.getByDisplayValue("hello") as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: "updated" } });
    expect(useStoryboardStore.getState().shots[0].prompt).toBe("updated");
  });
});

