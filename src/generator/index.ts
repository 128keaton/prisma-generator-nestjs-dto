import path from 'node:path';
import { camel, pascal, kebab, snake } from 'case';
import { logger } from '@prisma/sdk';
import { makeHelpers } from './template-helpers';
import { computeModelParams } from './compute-model-params';
import { generateConnectDto } from './generate-connect-dto';
import { generateCreateDto } from './generate-create-dto';
import { generateUpdateDto } from './generate-update-dto';
import { generateEntity } from './generate-entity';
import { DTO_IGNORE_MODEL } from './annotations';
import { isAnnotatedWith } from './field-classifiers';

import type { DMMF } from '@prisma/generator-helper';
import { NamingStyle, Model, WriteableFileSpecs, Enum } from './types';
import { generateEnum } from './generate-enum';

interface RunParam {
  output: string;
  dmmf: DMMF.Document;
  exportRelationModifierClasses: boolean;
  outputToNestJsResourceStructure: boolean;
  entitiesOnly: boolean;
  connectDtoPrefix: string;
  createDtoPrefix: string;
  updateDtoPrefix: string;
  dtoSuffix: string;
  entityPrefix: string;
  entitySuffix: string;
  enumPrefix: string;
  enumSuffix: string;
  fileNamingStyle: NamingStyle;
}

export const run = ({
  output,
  dmmf,
  ...options
}: RunParam): WriteableFileSpecs[] => {
  const {
    exportRelationModifierClasses,
    outputToNestJsResourceStructure,
    entitiesOnly,
    fileNamingStyle = 'camel',
    ...preAndSuffixes
  } = options;

  const transformers: Record<NamingStyle, (str: string) => string> = {
    camel,
    kebab,
    pascal,
    snake,
  };

  const transformFileNameCase = transformers[fileNamingStyle];

  const templateHelpers = makeHelpers({
    transformFileNameCase,
    transformClassNameCase: pascal,
    ...preAndSuffixes,
  });
  const allModels = dmmf.datamodel.models;

  const filteredModels: Model[] = allModels
    .filter((model) => !isAnnotatedWith(model, DTO_IGNORE_MODEL))
    // adds `output` information for each model so we can compute relative import paths
    // this assumes that NestJS resource modules (more specifically their folders on disk) are named as `transformFileNameCase(model.name)`
    .map((model) => ({
      ...model,
      output: {
        dto: outputToNestJsResourceStructure
          ? path.join(output, transformFileNameCase(model.name), 'dto')
          : output,
        entity: outputToNestJsResourceStructure
          ? path.join(output, transformFileNameCase(model.name), 'entities')
          : output,
      },
    }));

  const allEnums = dmmf.datamodel.enums;
  const filteredEnums: Enum[] = allEnums.map((enumeration) => {
    return {
      ...enumeration,
      output: {
        enum: outputToNestJsResourceStructure
          ? path.join(output, transformFileNameCase(enumeration.name), 'enums')
          : output,
      },
    };
  });

  const enumFiles = filteredEnums.map((enumeration) => {
    logger.info(`Processing Enum ${enumeration.name}`);

    // generate enumName.enum.ts
    const mappedEnum = {
      fileName: path.join(
        enumeration.output.enum,
        templateHelpers.enumFilename(enumeration.name, true),
      ),
      content: generateEnum({
        name: enumeration.name,
        values: templateHelpers.enumValuesToEnumProps(enumeration.values),
      }),
    };

    return [mappedEnum];
  });

  const modelFiles = filteredModels.map((model) => {
    logger.info(`Processing Model ${model.name}`);

    const modelParams = computeModelParams({
      model,
      allModels: filteredModels,
      allEnums: filteredEnums,
      templateHelpers,
    });

    // generate connect-model.dto.ts
    const connectDto = {
      fileName: path.join(
        model.output.dto,
        templateHelpers.connectDtoFilename(model.name, true),
      ),
      content: generateConnectDto({
        ...modelParams.connect,
        templateHelpers,
      }),
    };

    // generate create-model.dto.ts
    const createDto = {
      fileName: path.join(
        model.output.dto,
        templateHelpers.createDtoFilename(model.name, true),
      ),
      content: generateCreateDto({
        ...modelParams.create,
        exportRelationModifierClasses,
        templateHelpers,
      }),
    };
    // TODO generate create-model.struct.ts

    // generate update-model.dto.ts
    const updateDto = {
      fileName: path.join(
        model.output.dto,
        templateHelpers.updateDtoFilename(model.name, true),
      ),
      content: generateUpdateDto({
        ...modelParams.update,
        exportRelationModifierClasses,
        templateHelpers,
      }),
    };
    // TODO generate update-model.struct.ts

    // generate model.entity.ts
    const entity = {
      fileName: path.join(
        model.output.entity,
        templateHelpers.entityFilename(model.name, true),
      ),
      content: generateEntity({
        ...modelParams.entity,
        templateHelpers,
      }),
    };
    // TODO generate model.struct.ts

    if (entitiesOnly) return [entity];

    return [connectDto, createDto, updateDto, entity];
  });

  return [...modelFiles, ...enumFiles].flat();
};
