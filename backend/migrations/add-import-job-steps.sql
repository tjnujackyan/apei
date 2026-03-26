-- 添加步骤跟踪字段到 import_jobs 表

-- SQLite
ALTER TABLE import_jobs ADD COLUMN currentStep INTEGER DEFAULT 0;
ALTER TABLE import_jobs ADD COLUMN stepName TEXT;

-- MySQL/PostgreSQL (如果使用)
-- ALTER TABLE import_jobs ADD COLUMN currentStep INT DEFAULT 0;
-- ALTER TABLE import_jobs ADD COLUMN stepName VARCHAR(50);

-- 更新现有记录
UPDATE import_jobs 
SET currentStep = CASE 
    WHEN status = 'pending' THEN 0
    WHEN status = 'processing' THEN 1
    WHEN status = 'completed' THEN 2
    WHEN status = 'failed' THEN 0
    ELSE 0
END,
stepName = CASE 
    WHEN status = 'pending' THEN '等待处理'
    WHEN status = 'processing' THEN '导入识别'
    WHEN status = 'completed' THEN '完成'
    WHEN status = 'failed' THEN '失败'
    ELSE NULL
END
WHERE currentStep IS NULL OR currentStep = 0;

