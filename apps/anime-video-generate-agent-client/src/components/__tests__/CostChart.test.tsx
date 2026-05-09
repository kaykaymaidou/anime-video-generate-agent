import { render } from "@testing-library/react";
import { CostChart } from "../Cost/CostChart";

describe("CostChart", () => {
  it("renders without crashing", () => {
    render(<CostChart points={[{ ts: Date.now(), cost: 1.23 }]} />);
  });
});

