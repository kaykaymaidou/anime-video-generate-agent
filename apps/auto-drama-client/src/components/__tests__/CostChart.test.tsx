import { render } from "@testing-library/react";
import { CostChart } from "../Cost/CostChart";
import { useCostStore } from "@/store/costStore";

describe("CostChart", () => {
  it("renders without crashing", () => {
    useCostStore.setState({
      transactions: [{ id: "t1", ts: Date.now(), description: "x", cost: 1.23 }]
    } as any);
    render(<CostChart />);
  });
});

