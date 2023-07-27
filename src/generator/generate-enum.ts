interface GenerateEnumParams {
  name: string;
  values: string;
}

export const generateEnum = ({ name, values }: GenerateEnumParams) => `
export enum ${name} {
  ${values}
}
`;
