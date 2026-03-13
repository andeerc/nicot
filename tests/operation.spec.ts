import { Entity } from 'typeorm';
import { CrudService } from '../src/crud-base';
import { IdBase } from '../src/bases';
import { StringColumn } from '../src/decorators';

@Entity('operation_entities')
class OperationEntity extends IdBase() {
  @StringColumn(64, { required: true })
  name: string;
}

describe('operation', () => {
  const createService = (loadedEntity: OperationEntity | null) => {
    const txRepo = {
      metadata: {
        tableName: 'operation_entities',
        columns: [{ propertyName: 'id' }, { propertyName: 'name' }],
      },
      findOne: jest.fn().mockResolvedValue(loadedEntity),
      update: jest.fn().mockResolvedValue({ affected: loadedEntity ? 1 : 0 }),
    };

    const txManager = {
      queryRunner: {
        isTransactionActive: true,
      },
      getRepository: jest.fn().mockReturnValue(txRepo),
    };

    const manager = {
      queryRunner: undefined,
      transaction: jest.fn().mockImplementation(async (cb) => cb(txManager)),
      getRepository: jest.fn().mockReturnValue(txRepo),
    };

    const repo = {
      manager,
      metadata: txRepo.metadata,
      exists: jest.fn(),
    };

    const Service = CrudService(OperationEntity);
    const service = new Service(repo as any);

    return {
      service,
      repo,
      txRepo,
      manager,
      txManager,
    };
  };

  it('should use a single locked lookup before flushing changes', async () => {
    const loadedEntity = Object.assign(new OperationEntity(), {
      id: 1,
      name: 'before',
    });
    const { service, repo, txRepo, manager } = createService(loadedEntity);

    const result = await service.operation(1, async (entity) => {
      entity.name = 'after';
    });

    expect(result.message).toBe('success');
    expect(repo.exists).not.toHaveBeenCalled();
    expect(manager.transaction).toHaveBeenCalledTimes(1);
    expect(txRepo.findOne).toHaveBeenCalledTimes(1);
    expect(txRepo.findOne).toHaveBeenCalledWith({
      lock: { mode: 'pessimistic_write', tables: ['operation_entities'] },
      where: { id: 1 },
    });
    expect(txRepo.update).toHaveBeenCalledWith({ id: 1 }, { name: 'after' });
  });

  it('should 404 with a single locked lookup when the row does not exist', async () => {
    const { service, repo, txRepo, manager } = createService(null);

    await expect(
      service.operation(999999, async () => {
        throw new Error('should not run');
      }),
    ).rejects.toMatchObject({
      status: 404,
    });

    expect(repo.exists).not.toHaveBeenCalled();
    expect(manager.transaction).toHaveBeenCalledTimes(1);
    expect(txRepo.findOne).toHaveBeenCalledTimes(1);
    expect(txRepo.findOne).toHaveBeenCalledWith({
      lock: { mode: 'pessimistic_write', tables: ['operation_entities'] },
      where: { id: 999999 },
    });
    expect(txRepo.update).not.toHaveBeenCalled();
  });
});
