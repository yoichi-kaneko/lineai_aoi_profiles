export type WeightedChoice = {
  choice: string;
  weight: number;
};

function printUsage() {
  console.error("使用方法: pnpm exec tsx src/util/random_choice.ts <選択肢1> <選択肢2> [選択肢3 ...]");
  console.error("重み付き: pnpm exec tsx src/util/random_choice.ts --weighted <選択肢1>:<重み1> <選択肢2>:<重み2> [選択肢3:重み3 ...]");
  console.error("例: pnpm exec tsx src/util/random_choice.ts ラーメン カレー うどん");
  console.error("例: pnpm exec tsx src/util/random_choice.ts --weighted ラーメン:70 カレー:30");
}

export function parseWeightedChoice(value: string): WeightedChoice {
  const separatorIndex = value.indexOf(":");

  if (separatorIndex <= 0 || separatorIndex !== value.lastIndexOf(":")) {
    throw new Error(`重み付き選択肢は「選択肢:重み」の形式で指定してください: ${value}`);
  }

  const choice = value.slice(0, separatorIndex);
  const weightValue = value.slice(separatorIndex + 1);

  if (choice.length === 0) {
    throw new Error(`選択肢が空です: ${value}`);
  }

  if (!/^(0|[1-9]\d*)$/.test(weightValue)) {
    throw new Error(`重みは0以上の整数で指定してください: ${value}`);
  }

  return {
    choice,
    weight: Number(weightValue),
  };
}

export function selectWeighted(choices: WeightedChoice[]): number {
  const totalWeight = choices.reduce((sum, choice) => sum + choice.weight, 0);

  if (totalWeight <= 0) {
    throw new Error("重みの合計は1以上にしてください");
  }

  const draw = Math.random() * totalWeight;
  let cumulativeWeight = 0;

  for (let index = 0; index < choices.length; index += 1) {
    cumulativeWeight += choices[index].weight;

    if (draw < cumulativeWeight) {
      return index;
    }
  }

  return choices.length - 1;
}

const isDirectRun =
  !!process.argv[1] && process.argv[1].endsWith("random_choice.ts");

async function main() {
  const args = process.argv.slice(2);
  const weighted = args[0] === "--weighted";
  const choices = weighted ? args.slice(1) : args;

  if (choices.length < 2) {
    printUsage();
    process.exit(1);
  }

  if (weighted) {
    const weightedChoices = choices.map(parseWeightedChoice);
    const totalWeight = weightedChoices.reduce((sum, choice) => sum + choice.weight, 0);
    const index = selectWeighted(weightedChoices);
    const selected = weightedChoices[index].choice;

    console.log(JSON.stringify({
      selected,
      index,
      total: weightedChoices.length,
      choices: weightedChoices.map((choice) => choice.choice),
      weights: weightedChoices.map((choice) => choice.weight),
      totalWeight,
      mode: "weighted",
    }, null, 2));
    return;
  }

  const index = Math.floor(Math.random() * choices.length);
  const selected = choices[index];

  console.log(JSON.stringify({
    selected,
    index,
    total: choices.length,
    choices,
  }, null, 2));
}

if (isDirectRun) {
  main().catch((error) => {
    console.error("エラーが発生しました:", error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
