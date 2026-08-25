const fs = require('fs');
const path = require('path');

describe('Local Upload Logic Cleanup Verification', () => {
  
  describe('Controller File Analysis', () => {
    const controllersDir = path.join(__dirname, '../../controllers');
    
    test('should not contain local file deletion logic in sellerProductController.js', () => {
      const filePath = path.join(controllersDir, 'sellerProductController.js');
      const content = fs.readFileSync(filePath, 'utf8');
      
      // Should not contain local file deletion patterns
      expect(content).not.toMatch(/fs\.unlinkSync/);
      expect(content).not.toMatch(/fs\.existsSync.*uploads/);
      expect(content).not.toMatch(/path\.join.*__dirname.*uploads/);
      expect(content).not.toMatch(/deleteFile.*path\.join/);
      
      // Should contain R2 deletion
      expect(content).toMatch(/deleteFileFromR2/);
      expect(content).toMatch(/require.*r2UploadService/);
    });

    test('should not contain local file deletion logic in adminProductController.js', () => {
      const filePath = path.join(controllersDir, 'adminProductController.js');
      const content = fs.readFileSync(filePath, 'utf8');
      
      // Should not contain local file deletion patterns
      expect(content).not.toMatch(/fs\.unlinkSync/);
      expect(content).not.toMatch(/fs\.existsSync.*uploads/);
      expect(content).not.toMatch(/path\.join.*__dirname.*uploads/);
      expect(content).not.toMatch(/deleteFile.*path\.join/);
      
      // Should contain R2 deletion
      expect(content).toMatch(/deleteFileFromR2/);
      expect(content).toMatch(/require.*r2UploadService/);
    });

    test('should not contain local file deletion logic in brandController.js', () => {
      const filePath = path.join(controllersDir, 'brandController.js');
      const content = fs.readFileSync(filePath, 'utf8');
      
      // Should not contain local file deletion patterns
      expect(content).not.toMatch(/fs\.unlinkSync/);
      expect(content).not.toMatch(/fs\.existsSync.*uploads/);
      expect(content).not.toMatch(/path\.join.*__dirname.*uploads/);
      
      // Should contain R2 deletion
      expect(content).toMatch(/deleteFileFromR2/);
      expect(content).toMatch(/require.*r2UploadService/);
    });

    test('should verify R2 service integration in upload controllers', () => {
      const uploadControllers = [
        'sellerProductController.js',
        'adminProductController.js',
        'brandController.js'
      ];

      uploadControllers.forEach(controllerName => {
        const filePath = path.join(controllersDir, controllerName);
        const content = fs.readFileSync(filePath, 'utf8');
        
        // Should import R2 service
        expect(content).toMatch(/require.*r2UploadService/);
        expect(content).toMatch(/deleteFileFromR2/);
        
        // Should not have local deleteFile function
        expect(content).not.toMatch(/const deleteFile = \(filePath\) =>/);
        expect(content).not.toMatch(/fs\.unlinkSync\(filePath\)/);
      });
    });
  });

  describe('File Deletion Logic Verification', () => {
    test('should verify product deletion uses R2 service', () => {
      const sellerControllerPath = path.join(__dirname, '../../controllers/sellerProductController.js');
      const content = fs.readFileSync(sellerControllerPath, 'utf8');
      
      // Should use R2 deletion in deleteProduct function
      const deleteProductMatch = content.match(/exports\.deleteProduct[\s\S]*?}/);
      expect(deleteProductMatch).toBeTruthy();
      expect(deleteProductMatch[0]).toMatch(/deleteFileFromR2/);
      expect(deleteProductMatch[0]).not.toMatch(/fs\.unlinkSync/);
    });

    test('should verify product update uses R2 service for old file deletion', () => {
      const sellerControllerPath = path.join(__dirname, '../../controllers/sellerProductController.js');
      const content = fs.readFileSync(sellerControllerPath, 'utf8');
      
      // Should use R2 deletion in updateProduct function
      const updateProductMatch = content.match(/exports\.updateProduct[\s\S]*?}/);
      expect(updateProductMatch).toBeTruthy();
      expect(updateProductMatch[0]).toMatch(/deleteFileFromR2/);
      expect(updateProductMatch[0]).not.toMatch(/fs\.unlinkSync/);
    });

    test('should verify admin product deletion uses R2 service', () => {
      const adminControllerPath = path.join(__dirname, '../../controllers/adminProductController.js');
      const content = fs.readFileSync(adminControllerPath, 'utf8');
      
      // Should use R2 deletion in deleteProduct function
      const deleteProductMatch = content.match(/exports\.deleteProduct[\s\S]*?}/);
      expect(deleteProductMatch).toBeTruthy();
      expect(deleteProductMatch[0]).toMatch(/deleteFileFromR2/);
      expect(deleteProductMatch[0]).not.toMatch(/fs\.unlinkSync/);
    });

    test('should verify brand deletion uses R2 service', () => {
      const brandControllerPath = path.join(__dirname, '../../controllers/brandController.js');
      const content = fs.readFileSync(brandControllerPath, 'utf8');
      
      // Should use R2 deletion in deleteBrand function
      const deleteBrandMatch = content.match(/exports\.deleteBrand[\s\S]*?}/);
      expect(deleteBrandMatch).toBeTruthy();
      expect(deleteBrandMatch[0]).toMatch(/deleteFileFromR2/);
      expect(deleteBrandMatch[0]).not.toMatch(/fs\.unlinkSync/);
    });
  });

  describe('Hardcoded Path Removal Verification', () => {
    test('should not contain hardcoded upload paths in main upload controllers', () => {
      const uploadControllers = [
        'sellerProductController.js',
        'adminProductController.js',
        'brandController.js'
      ];

      uploadControllers.forEach(controllerName => {
        const filePath = path.join(__dirname, '../../controllers', controllerName);
        const content = fs.readFileSync(filePath, 'utf8');
        
        // Should not contain hardcoded upload paths
        expect(content).not.toMatch(/\.\.\/uploads\//);
        expect(content).not.toMatch(/uploads\/.*filename/);
        expect(content).not.toMatch(/path\.join.*__dirname.*uploads/);
      });
    });

    test('should verify folder structure uses R2 paths', () => {
      const sellerControllerPath = path.join(__dirname, '../../controllers/sellerProductController.js');
      const content = fs.readFileSync(sellerControllerPath, 'utf8');
      
      // Should still have folder structure for R2 organization
      expect(content).toMatch(/getSellerFolder/);
      expect(content).toMatch(/sellers/);
      
      // But should not use local paths
      expect(content).not.toMatch(/uploads\/sellers/);
    });
  });

  describe('Import Statement Verification', () => {
    test('should have correct R2 service imports', () => {
      const uploadControllers = [
        'sellerProductController.js',
        'adminProductController.js',
        'brandController.js'
      ];

      uploadControllers.forEach(controllerName => {
        const filePath = path.join(__dirname, '../../controllers', controllerName);
        const content = fs.readFileSync(filePath, 'utf8');
        
        // Should import R2 service
        expect(content).toMatch(/require.*r2UploadService/);
        expect(content).toMatch(/deleteFileFromR2/);
        
        // Should not import fs for file operations (except for CSV reading)
        if (controllerName.includes('Product')) {
          // Product controllers may still use fs for CSV reading
          expect(content).toMatch(/require.*fs/);
        }
      });
    });
  });

  describe('Error Handling Verification', () => {
    test('should maintain error handling while using R2 deletion', () => {
      const sellerControllerPath = path.join(__dirname, '../../controllers/sellerProductController.js');
      const content = fs.readFileSync(sellerControllerPath, 'utf8');
      
      // Should still have try-catch blocks
      expect(content).toMatch(/try\s*{[\s\S]*?deleteFileFromR2/);
      expect(content).toMatch(/catch.*err.*{[\s\S]*?sendErrorResponse/);
    });
  });
});
