export function splitDialogueExamples(value: string): string[] {
  const lines = value.replace(/\r\n?/g, "\n").split("\n");
  const examples: string[] = [];
  let current: string[] = [];

  for (const line of lines) {
    if (line.trim().toUpperCase() === "<START>" && current.some(part => part.trim())) {
      examples.push(current.join("\n").trim());
      current = ["<START>"];
    } else {
      current.push(line);
    }
  }

  if (current.some(part => part.trim())) examples.push(current.join("\n").trim());
  return examples;
}

export function joinDialogueExamples(examples: string[]): string {
  return examples.map(example => example.trim()).filter(Boolean).join("\n\n");
}

export function emptyDialogueExample(): string {
  return "<START>\n{{user}}: \n{{char}}: ";
}
