import { TemplateHelpers } from '../template-helpers';
import { computeConnectDtoParams } from './compute-connect-dto-params';
import { computeCreateDtoParams } from './compute-create-dto-params';
import { computeUpdateDtoParams } from './compute-update-dto-params';
import { computeEntityParams } from './compute-entity-params';

import type { Model, ModelParams } from '../types';

interface ComputeModelParamsParam {
  model: Model;
  allModels: Model[];
  allEnums: any[];
  templateHelpers: TemplateHelpers;
}
export const computeModelParams = ({
  model,
  allModels,
  allEnums,
  templateHelpers,
}: ComputeModelParamsParam): ModelParams => ({
  // TODO find out if model needs `ConnectDTO`
  connect: computeConnectDtoParams({ model }),
  create: computeCreateDtoParams({
    model,
    allModels,
    allEnums,
    templateHelpers,
  }),

  update: computeUpdateDtoParams({
    model,
    allModels,
    allEnums,
    templateHelpers,
  }),
  entity: computeEntityParams({ model, allModels, allEnums, templateHelpers }),
});
