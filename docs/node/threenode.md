现在开始做第一个真正的业务模块：商品中心。从分类品牌 CRUD 到 SPU/SKU 和上下架，这是电商 ERP 的基础。后续购物车、订单、库存、营销、搜索、报表都会依赖商品数据。会一步步实现：

```text
分类 CRUD
  -> 品牌 CRUD
  -> 商品 SPU
  -> SKU
  -> 商品图片
  -> 上下架
  -> 小程序商品列表和详情
  -> 商品搜索索引
```
最终实现这些接口：

```text
后台分类：
GET    /api/admin/v1/catalog/categories
POST   /api/admin/v1/catalog/categories
GET    /api/admin/v1/catalog/categories/:id
PUT    /api/admin/v1/catalog/categories/:id
DELETE /api/admin/v1/catalog/categories/:id

后台品牌：
GET    /api/admin/v1/catalog/brands
POST   /api/admin/v1/catalog/brands
GET    /api/admin/v1/catalog/brands/:id
PUT    /api/admin/v1/catalog/brands/:id
DELETE /api/admin/v1/catalog/brands/:id

后台商品：
GET    /api/admin/v1/catalog/products
POST   /api/admin/v1/catalog/products
GET    /api/admin/v1/catalog/products/:id
PUT    /api/admin/v1/catalog/products/:id
POST   /api/admin/v1/products/:id/on-sale
POST   /api/admin/v1/products/:id/off-sale

小程序商品：
GET    /api/app/v1/categories
GET    /api/app/v1/brands
GET    /api/app/v1/products
GET    /api/app/v1/products/:id

搜索索引：
POST   /api/admin/v1/search/products/:id/sync
GET    /api/admin/v1/search/products
```

本章继续用内存仓储。真实 ERP 项目中，对应表主要是：

```text
ec_category
ec_brand
ec_product
ec_sku
ec_product_image
ec_shop_product
ec_product_search_index
```

## 新增目录结构

```text
src/
  modules/
    catalog/
      catalog.module.ts
      catalog.controller.ts
      catalog.service.ts
      catalog.repository.ts
      catalog.types.ts
      dto/
        category.dto.ts
        brand.dto.ts
        product.dto.ts
    search/
      search.module.ts
      search.controller.ts
      search.service.ts
```

为什么把搜索单独成模块：

- 商品模块负责商品主数据。
- 搜索模块负责查询优化和搜索索引。
- 第一版搜索可以很简单，但后续可能接 OpenSearch/Elasticsearch，独立模块更方便替换。

## 商品中心为什么要拆这么多表?

一开始可能会设计一张商品表：

```text
product
  id
  title
  category
  brand
  price
  stock
  image
```

很快会遇到问题：

- 分类要有层级，比如 食品 -> 饮料 -> 茶。
- 品牌要有 logo、排序、状态。
- 一个商品有多个规格，比如颜色、尺码、容量。
- 不同 SKU 价格、库存、图片可能不同。
- 商品可以下架，但历史订单还要保留。
- 商品要按关键字、分类、品牌、价格搜索。

所以商品中心逐步拆成：

```text
分类 ec_category
品牌 ec_brand
商品主表 ec_product
SKU ec_sku
商品图片 ec_product_image
店铺商品关系 ec_shop_product
搜索索引 ec_product_search_index
```

最重要的两个概念：

| 概念 | 说明 | 例子 |
| --- | --- | --- |
| SPU | 商品主信息 | iPhone 15 |
| SKU | 具体可购买规格 | iPhone 15 / 黑色 / 256G |

为什么订单买的是 SKU：

- SKU 才有明确价格。
- SKU 才有明确库存。
- SKU 才能表达具体规格。

## 定义商品类型

### `catalog.types.ts`

```ts
export type EntityStatus = 'enabled' | 'disabled';
export type SaleStatus = 'draft' | 'on_sale' | 'off_sale';
export type SkuStatus = 'enabled' | 'disabled';

export type Category = {
  id: string;
  parentId?: string;
  name: string;
  code: string;
  level: number;
  path: string;
  imageUrl?: string;
  sortNo: number;
  status: EntityStatus;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date;
};

export type Brand = {
  id: string;
  name: string;
  code: string;
  logoUrl?: string;
  sortNo: number;
  status: EntityStatus;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date;
};

export type ProductImage = {
  id: string;
  url: string;
  type: 'main' | 'detail' | 'sku';
  sortNo: number;
  skuId?: string;
};

export type Sku = {
  id: string;
  skuNo: string;
  barcode?: string;
  spec: Record<string, string>;
  imageUrl?: string;
  marketPrice: number;
  salePrice: number;
  costPrice?: number;
  stockQty: number;
  status: SkuStatus;
};

export type Product = {
  id: string;
  productNo: string;
  categoryId: string;
  brandId?: string;
  title: string;
  subTitle?: string;
  mainImageUrl?: string;
  detailHtml?: string;
  saleStatus: SaleStatus;
  sortNo: number;
  salesCount: number;
  searchKeywords?: string;
  skus: Sku[];
  images: ProductImage[];
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date;
};

export type ProductSearchIndex = {
  productId: string;
  title: string;
  categoryName: string;
  brandName?: string;
  minPrice: number;
  maxPrice: number;
  saleStatus: SaleStatus;
  searchText: string;
  indexedAt: Date;
};
```

为什么`stockQty` 先放在 SKU：

- 方便理解 SKU 和库存的关系。
- 真实项目中库存会拆到 `ec_stock_balance`，因为库存有仓库、锁定、流水。
- 这一章先知道“SKU 有库存”，第六章再升级成完整库存系统。

## 分类 DTO

### `category.dto.ts`

```ts
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Matches,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CategoryQueryDto {
  @IsOptional()
  @IsString()
  keyword?: string;

  @IsOptional()
  @IsIn(['enabled', 'disabled'])
  status?: 'enabled' | 'disabled';
}

export class CategoryMutationDto {
  @IsOptional()
  @IsString()
  parentId?: string;

  @IsString()
  @Length(1, 50)
  name!: string;

  @IsString()
  @Length(2, 64)
  @Matches(/^[a-zA-Z0-9_-]+$/)
  code!: string;

  @IsOptional()
  @IsString()
  imageUrl?: string;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  sortNo!: number;

  @IsIn(['enabled', 'disabled'])
  status!: 'enabled' | 'disabled';
}
```

为什么分类要有 `code`：

- 名称可能改，比如“手机数码”改成“数码产品”。
- code 更适合系统识别和导入导出。
- 同一租户下 code 应唯一。

为什么有 `parentId`：

- 分类是树。
- `parentId` 是最容易理解的树结构。

真实项目还会有：

```text
level
path
```

为什么有 `level/path`：

- 查询分类树和判断层级更方便。
- path 可以记录祖先链，比如 `1/5/9`。

## 品牌 DTO

### `brand.dto.ts`

```ts
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Matches,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

export class BrandQueryDto {
  @IsOptional()
  @IsString()
  keyword?: string;

  @IsOptional()
  @IsIn(['enabled', 'disabled'])
  status?: 'enabled' | 'disabled';
}

export class BrandMutationDto {
  @IsString()
  @Length(1, 50)
  name!: string;

  @IsString()
  @Length(2, 64)
  @Matches(/^[a-zA-Z0-9_-]+$/)
  code!: string;

  @IsOptional()
  @IsString()
  logoUrl?: string;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  sortNo!: number;

  @IsIn(['enabled', 'disabled'])
  status!: 'enabled' | 'disabled';
}
```

为什么品牌独立成表：

- 商品可以按品牌筛选。
- 品牌可以有 logo 和排序。
- 如果品牌只是商品表中的字符串，会导致同一个品牌写法不统一。

## 商品 DTO

### `product.dto.ts`

```ts
import {
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Length,
  Matches,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class ProductQueryDto {
  @IsOptional()
  @IsString()
  keyword?: string;

  @IsOptional()
  @IsString()
  categoryId?: string;

  @IsOptional()
  @IsString()
  brandId?: string;

  @IsOptional()
  @IsIn(['draft', 'on_sale', 'off_sale'])
  saleStatus?: 'draft' | 'on_sale' | 'off_sale';
}

export class SkuInputDto {
  @IsString()
  @Length(2, 64)
  @Matches(/^[a-zA-Z0-9_-]+$/)
  skuNo!: string;

  @IsOptional()
  @IsString()
  barcode?: string;

  @IsObject()
  spec!: Record<string, string>;

  @IsOptional()
  @IsString()
  imageUrl?: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  marketPrice!: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  salePrice!: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  costPrice?: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  stockQty!: number;

  @IsIn(['enabled', 'disabled'])
  status!: 'enabled' | 'disabled';
}

export class ProductImageInputDto {
  @IsString()
  url!: string;

  @IsIn(['main', 'detail', 'sku'])
  type!: 'main' | 'detail' | 'sku';

  @Type(() => Number)
  @IsInt()
  @Min(0)
  sortNo!: number;

  @IsOptional()
  @IsString()
  skuId?: string;
}

export class ProductMutationDto {
  @IsString()
  @Length(2, 64)
  @Matches(/^[a-zA-Z0-9_-]+$/)
  productNo!: string;

  @IsString()
  categoryId!: string;

  @IsOptional()
  @IsString()
  brandId?: string;

  @IsString()
  @Length(1, 100)
  title!: string;

  @IsOptional()
  @IsString()
  @Length(0, 200)
  subTitle?: string;

  @IsOptional()
  @IsString()
  mainImageUrl?: string;

  @IsOptional()
  @IsString()
  detailHtml?: string;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  sortNo!: number;

  @IsOptional()
  @IsString()
  searchKeywords?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => SkuInputDto)
  skus!: SkuInputDto[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProductImageInputDto)
  images!: ProductImageInputDto[];
}
```

为什么创建商品时至少要有一个 SKU：

- 小程序最终购买的是 SKU。
- 没有 SKU 就没有明确价格和库存。
- 即使是单规格商品，也可以建一个默认 SKU。

真实项目金额不能用浮点数，应该使用数据库 `DECIMAL`，服务端用 Decimal 类型或字符串处理。

## CatalogRepository

### 基础结构

```ts
import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Brand, Category, Product, ProductSearchIndex } from './catalog.types';

@Injectable()
export class CatalogRepository {
  private categories: Category[] = [];
  private brands: Brand[] = [];
  private products: Product[] = [];
  private searchIndexes: ProductSearchIndex[] = [];

  private ids = {
    category: 1,
    brand: 1,
    product: 1,
    sku: 1,
    image: 1,
  };

  private nextId(type: keyof typeof this.ids) {
    return String(this.ids[type]++);
  }

  private now() {
    return new Date();
  }
}
```

### 分类方法

```ts
async listCategories(query: { keyword?: string; status?: string } = {}) {
  return this.categories
    .filter((item) => {
      if (item.deletedAt) return false;
      if (query.status && item.status !== query.status) return false;
      if (query.keyword) {
        return item.name.includes(query.keyword) || item.code.includes(query.keyword);
      }
      return true;
    })
    .sort((a, b) => a.sortNo - b.sortNo);
}

async getCategory(id: string) {
  const category = this.categories.find((item) => item.id === id && !item.deletedAt);
  if (!category) {
    throw new NotFoundException('category not found');
  }
  return category;
}

async createCategory(input: Omit<Category, 'id' | 'createdAt' | 'updatedAt'>) {
  const existed = this.categories.find(
    (item) => item.code === input.code && !item.deletedAt,
  );
  if (existed) {
    throw new ConflictException('category code already exists');
  }

  const now = this.now();
  const category: Category = {
    ...input,
    id: this.nextId('category'),
    createdAt: now,
    updatedAt: now,
  };

  this.categories.push(category);
  return category;
}

async updateCategory(id: string, patch: Partial<Category>) {
  const category = await this.getCategory(id);
  Object.assign(category, patch, { updatedAt: this.now() });
  return category;
}

async deleteCategory(id: string) {
  const category = await this.getCategory(id);
  category.deletedAt = this.now();
  category.updatedAt = this.now();
  return { success: true };
}
```

为什么删除分类要谨慎：

- 分类下面可能有子分类。
- 分类下面可能有商品。
- 真实项目删除前应检查是否被使用。

可以先软删除，后面再加“有商品不允许删除”的规则。

### 品牌方法

```ts
async listBrands(query: { keyword?: string; status?: string } = {}) {
  return this.brands
    .filter((item) => {
      if (item.deletedAt) return false;
      if (query.status && item.status !== query.status) return false;
      if (query.keyword) {
        return item.name.includes(query.keyword) || item.code.includes(query.keyword);
      }
      return true;
    })
    .sort((a, b) => a.sortNo - b.sortNo);
}

async getBrand(id: string) {
  const brand = this.brands.find((item) => item.id === id && !item.deletedAt);
  if (!brand) {
    throw new NotFoundException('brand not found');
  }
  return brand;
}

async createBrand(input: Omit<Brand, 'id' | 'createdAt' | 'updatedAt'>) {
  const existed = this.brands.find((item) => item.code === input.code && !item.deletedAt);
  if (existed) {
    throw new ConflictException('brand code already exists');
  }

  const now = this.now();
  const brand: Brand = {
    ...input,
    id: this.nextId('brand'),
    createdAt: now,
    updatedAt: now,
  };

  this.brands.push(brand);
  return brand;
}

async updateBrand(id: string, patch: Partial<Brand>) {
  const brand = await this.getBrand(id);
  Object.assign(brand, patch, { updatedAt: this.now() });
  return brand;
}

async deleteBrand(id: string) {
  const brand = await this.getBrand(id);
  brand.deletedAt = this.now();
  brand.updatedAt = this.now();
  return { success: true };
}
```

### 商品方法

```ts
async listProducts(query: {
  keyword?: string;
  categoryId?: string;
  brandId?: string;
  saleStatus?: string;
} = {}) {
  return this.products.filter((product) => {
    if (product.deletedAt) return false;
    if (query.categoryId && product.categoryId !== query.categoryId) return false;
    if (query.brandId && product.brandId !== query.brandId) return false;
    if (query.saleStatus && product.saleStatus !== query.saleStatus) return false;
    if (query.keyword) {
      return (
        product.title.includes(query.keyword) ||
        product.productNo.includes(query.keyword) ||
        product.searchKeywords?.includes(query.keyword)
      );
    }
    return true;
  });
}

async getProduct(id: string) {
  const product = this.products.find((item) => item.id === id && !item.deletedAt);
  if (!product) {
    throw new NotFoundException('product not found');
  }
  return product;
}

async createProduct(input: Omit<Product, 'id' | 'createdAt' | 'updatedAt' | 'salesCount'>) {
  const existed = this.products.find(
    (item) => item.productNo === input.productNo && !item.deletedAt,
  );
  if (existed) {
    throw new ConflictException('productNo already exists');
  }

  const skuNos = input.skus.map((sku) => sku.skuNo);
  const duplicatedSkuNo = skuNos.find((skuNo, index) => skuNos.indexOf(skuNo) !== index);
  if (duplicatedSkuNo) {
    throw new ConflictException(`duplicated skuNo: ${duplicatedSkuNo}`);
  }

  const now = this.now();
  const product: Product = {
    ...input,
    id: this.nextId('product'),
    salesCount: 0,
    createdAt: now,
    updatedAt: now,
    skus: input.skus.map((sku) => ({
      ...sku,
      id: this.nextId('sku'),
    })),
    images: input.images.map((image) => ({
      ...image,
      id: this.nextId('image'),
    })),
  };

  this.products.push(product);
  return product;
}

async updateProduct(id: string, patch: Omit<Product, 'id' | 'createdAt' | 'updatedAt' | 'salesCount'>) {
  const product = await this.getProduct(id);

  Object.assign(product, {
    ...patch,
    updatedAt: this.now(),
    skus: patch.skus.map((sku) => ({
      ...sku,
      id: sku.id || this.nextId('sku'),
    })),
    images: patch.images.map((image) => ({
      ...image,
      id: image.id || this.nextId('image'),
    })),
  });

  return product;
}

async updateProductSaleStatus(id: string, saleStatus: 'on_sale' | 'off_sale') {
  const product = await this.getProduct(id);
  product.saleStatus = saleStatus;
  product.updatedAt = this.now();
  return product;
}
```

说明：

- 为了简单`updateProduct`直接整体替换 SKU 和图片。
- 真实项目中要更谨慎：已有 SKU 可能被订单引用，不能随意删除或改编号。

为什么商品编号和 SKU 编号要唯一：

- 导入导出、仓库、订单、第三方系统常用编号识别商品。
- 编号重复会导致库存和订单关联混乱。

## CatalogService

Service 负责业务校验。

### 分类业务

```ts
import { BadRequestException, Injectable } from '@nestjs/common';
import { BrandMutationDto, BrandQueryDto } from './dto/brand.dto';
import { CategoryMutationDto, CategoryQueryDto } from './dto/category.dto';
import { ProductMutationDto, ProductQueryDto } from './dto/product.dto';
import { CatalogRepository } from './catalog.repository';

@Injectable()
export class CatalogService {
  constructor(private readonly repository: CatalogRepository) {}

  async listCategories(query: CategoryQueryDto) {
    const categories = await this.repository.listCategories(query);
    return this.buildCategoryTree(categories);
  }

  getCategory(id: string) {
    return this.repository.getCategory(id);
  }

  async createCategory(dto: CategoryMutationDto) {
    const parent = dto.parentId
      ? await this.repository.getCategory(dto.parentId)
      : null;

    const level = parent ? parent.level + 1 : 1;
    const path = parent ? `${parent.path}/${parent.id}` : '';

    return this.repository.createCategory({
      parentId: dto.parentId,
      name: dto.name,
      code: dto.code,
      level,
      path,
      imageUrl: dto.imageUrl,
      sortNo: dto.sortNo,
      status: dto.status,
    });
  }

  async updateCategory(id: string, dto: CategoryMutationDto) {
    return this.repository.updateCategory(id, {
      name: dto.name,
      imageUrl: dto.imageUrl,
      sortNo: dto.sortNo,
      status: dto.status,
    });
  }

  deleteCategory(id: string) {
    return this.repository.deleteCategory(id);
  }

  private buildCategoryTree(categories: Array<{
    id: string;
    parentId?: string;
    sortNo: number;
  }>) {
    const cloned = categories
      .map((item) => ({ ...item, children: [] as unknown[] }))
      .sort((a, b) => a.sortNo - b.sortNo);

    const map = new Map(cloned.map((item) => [item.id, item]));
    const roots: unknown[] = [];

    for (const category of cloned) {
      if (category.parentId && map.has(category.parentId)) {
        map.get(category.parentId)!.children.push(category);
      } else {
        roots.push(category);
      }
    }

    return roots;
  }
}
```

为什么更新分类时不允许改 `parentId/code`：

- 改 parent 会影响整棵子树的 level/path。
- 改 code 会影响导入导出和外部系统引用。
- 先保持简单，真实项目如果支持，要写专门逻辑重算子树。

### 品牌业务

```ts
listBrands(query: BrandQueryDto) {
  return this.repository.listBrands(query);
}

getBrand(id: string) {
  return this.repository.getBrand(id);
}

createBrand(dto: BrandMutationDto) {
  return this.repository.createBrand({
    name: dto.name,
    code: dto.code,
    logoUrl: dto.logoUrl,
    sortNo: dto.sortNo,
    status: dto.status,
  });
}

updateBrand(id: string, dto: BrandMutationDto) {
  return this.repository.updateBrand(id, {
    name: dto.name,
    logoUrl: dto.logoUrl,
    sortNo: dto.sortNo,
    status: dto.status,
  });
}

deleteBrand(id: string) {
  return this.repository.deleteBrand(id);
}
```

### 商品业务

```ts
async listAdminProducts(query: ProductQueryDto) {
  return this.repository.listProducts(query);
}

async listAppProducts(query: ProductQueryDto) {
  return this.repository.listProducts({
    ...query,
    saleStatus: 'on_sale',
  });
}

async getAdminProduct(id: string) {
  return this.repository.getProduct(id);
}

async getAppProduct(id: string) {
  const product = await this.repository.getProduct(id);
  if (product.saleStatus !== 'on_sale') {
    throw new BadRequestException('product is not on sale');
  }
  return product;
}

async createProduct(dto: ProductMutationDto) {
  await this.ensureCategoryEnabled(dto.categoryId);
  if (dto.brandId) {
    await this.ensureBrandEnabled(dto.brandId);
  }
  this.ensureValidSkuPrices(dto.skus);

  return this.repository.createProduct({
    productNo: dto.productNo,
    categoryId: dto.categoryId,
    brandId: dto.brandId,
    title: dto.title,
    subTitle: dto.subTitle,
    mainImageUrl: dto.mainImageUrl,
    detailHtml: dto.detailHtml,
    saleStatus: 'draft',
    sortNo: dto.sortNo,
    searchKeywords: dto.searchKeywords,
    skus: dto.skus,
    images: dto.images,
  });
}

async updateProduct(id: string, dto: ProductMutationDto) {
  await this.ensureCategoryEnabled(dto.categoryId);
  if (dto.brandId) {
    await this.ensureBrandEnabled(dto.brandId);
  }
  this.ensureValidSkuPrices(dto.skus);

  const current = await this.repository.getProduct(id);
  if (current.saleStatus === 'on_sale') {
    throw new BadRequestException('please off-sale product before editing');
  }

  return this.repository.updateProduct(id, {
    productNo: current.productNo,
    categoryId: dto.categoryId,
    brandId: dto.brandId,
    title: dto.title,
    subTitle: dto.subTitle,
    mainImageUrl: dto.mainImageUrl,
    detailHtml: dto.detailHtml,
    saleStatus: current.saleStatus,
    sortNo: dto.sortNo,
    searchKeywords: dto.searchKeywords,
    skus: dto.skus,
    images: dto.images,
  });
}

async onSaleProduct(id: string) {
  const product = await this.repository.getProduct(id);
  if (product.skus.length === 0) {
    throw new BadRequestException('product must have at least one sku');
  }
  if (!product.mainImageUrl) {
    throw new BadRequestException('product must have main image before on-sale');
  }
  if (!product.skus.some((sku) => sku.status === 'enabled')) {
    throw new BadRequestException('product must have enabled sku');
  }

  return this.repository.updateProductSaleStatus(id, 'on_sale');
}

async offSaleProduct(id: string) {
  return this.repository.updateProductSaleStatus(id, 'off_sale');
}

private async ensureCategoryEnabled(categoryId: string) {
  const category = await this.repository.getCategory(categoryId);
  if (category.status !== 'enabled') {
    throw new BadRequestException('category is disabled');
  }
}

private async ensureBrandEnabled(brandId: string) {
  const brand = await this.repository.getBrand(brandId);
  if (brand.status !== 'enabled') {
    throw new BadRequestException('brand is disabled');
  }
}

private ensureValidSkuPrices(skus: Array<{ salePrice: number; marketPrice: number }>) {
  for (const sku of skus) {
    if (sku.salePrice > sku.marketPrice) {
      throw new BadRequestException('salePrice cannot be greater than marketPrice');
    }
  }
}
```

为什么上架前要校验：

- 没有 SKU 无法购买。
- 没有启用 SKU 无法下单。
- 没有主图会影响小程序展示。
- 分类/品牌禁用时，商品也不应该正常上架。

为什么上架商品不建议直接编辑：

- 用户可能正在浏览或下单。
- 改价格、SKU、规格会影响正在进行的交易。
- 真实系统通常要求先下架再改，或者做版本/审核机制。

## CatalogController

### 后台接口

```ts
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AdminAuthGuard } from '../../common/guards/admin-auth.guard';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { CatalogService } from './catalog.service';
import { BrandMutationDto, BrandQueryDto } from './dto/brand.dto';
import { CategoryMutationDto, CategoryQueryDto } from './dto/category.dto';
import { ProductMutationDto, ProductQueryDto } from './dto/product.dto';

@UseGuards(AdminAuthGuard)
@Controller('/api/admin/v1/catalog')
export class AdminCatalogController {
  constructor(private readonly catalogService: CatalogService) {}

  @RequirePermissions('catalog:read')
  @Get('/categories')
  listCategories(@Query() query: CategoryQueryDto) {
    return this.catalogService.listCategories(query);
  }

  @RequirePermissions('catalog:write')
  @Post('/categories')
  createCategory(@Body() dto: CategoryMutationDto) {
    return this.catalogService.createCategory(dto);
  }

  @RequirePermissions('catalog:write')
  @Put('/categories/:id')
  updateCategory(@Param('id') id: string, @Body() dto: CategoryMutationDto) {
    return this.catalogService.updateCategory(id, dto);
  }

  @RequirePermissions('catalog:write')
  @Delete('/categories/:id')
  deleteCategory(@Param('id') id: string) {
    return this.catalogService.deleteCategory(id);
  }

  @RequirePermissions('catalog:read')
  @Get('/brands')
  listBrands(@Query() query: BrandQueryDto) {
    return this.catalogService.listBrands(query);
  }

  @RequirePermissions('catalog:write')
  @Post('/brands')
  createBrand(@Body() dto: BrandMutationDto) {
    return this.catalogService.createBrand(dto);
  }

  @RequirePermissions('catalog:write')
  @Put('/brands/:id')
  updateBrand(@Param('id') id: string, @Body() dto: BrandMutationDto) {
    return this.catalogService.updateBrand(id, dto);
  }

  @RequirePermissions('catalog:write')
  @Delete('/brands/:id')
  deleteBrand(@Param('id') id: string) {
    return this.catalogService.deleteBrand(id);
  }

  @RequirePermissions('catalog:read')
  @Get('/products')
  listProducts(@Query() query: ProductQueryDto) {
    return this.catalogService.listAdminProducts(query);
  }

  @RequirePermissions('catalog:read')
  @Get('/products/:id')
  getProduct(@Param('id') id: string) {
    return this.catalogService.getAdminProduct(id);
  }

  @RequirePermissions('catalog:write')
  @Post('/products')
  createProduct(@Body() dto: ProductMutationDto) {
    return this.catalogService.createProduct(dto);
  }

  @RequirePermissions('catalog:write')
  @Put('/products/:id')
  updateProduct(@Param('id') id: string, @Body() dto: ProductMutationDto) {
    return this.catalogService.updateProduct(id, dto);
  }

  @RequirePermissions('catalog:write')
  @Post('/products/:id/on-sale')
  onSale(@Param('id') id: string) {
    return this.catalogService.onSaleProduct(id);
  }

  @RequirePermissions('catalog:write')
  @Post('/products/:id/off-sale')
  offSale(@Param('id') id: string) {
    return this.catalogService.offSaleProduct(id);
  }
}
```

为什么后台商品接口需要权限：

- 商品价格、上下架会影响交易。
- 不是所有后台员工都能改商品。
- 写操作还会被审计 Interceptor 记录。

### 小程序接口

```ts
@Controller('/api/app/v1')
export class AppCatalogController {
  constructor(private readonly catalogService: CatalogService) {}

  @Get('/categories')
  listCategories() {
    return this.catalogService.listCategories({ status: 'enabled' });
  }

  @Get('/brands')
  listBrands() {
    return this.catalogService.listBrands({ status: 'enabled' });
  }

  @Get('/products')
  listProducts(@Query() query: ProductQueryDto) {
    return this.catalogService.listAppProducts(query);
  }

  @Get('/products/:id')
  getProduct(@Param('id') id: string) {
    return this.catalogService.getAppProduct(id);
  }
}
```

为什么后台接口和小程序接口分开：

- 后台可以看到草稿、下架商品。
- 小程序只能看到已上架商品。
- 后台返回管理字段，小程序返回展示字段。
- 权限要求也不同。

## CatalogModule

```ts
import { Module } from '@nestjs/common';
import { CatalogRepository } from './catalog.repository';
import { CatalogService } from './catalog.service';
import { AdminCatalogController, AppCatalogController } from './catalog.controller';

@Module({
  controllers: [
    AdminCatalogController,
    AppCatalogController,
  ],
  providers: [
    CatalogRepository,
    CatalogService,
  ],
  exports: [
    CatalogRepository,
    CatalogService,
  ],
})
export class CatalogModule {}
```

为什么导出 `CatalogService`：

- 购物车要校验商品和 SKU。
- 订单要读取商品快照。
- 搜索模块要同步商品索引。

也就是说商品中心是基础业务模块，会被很多模块依赖。

## 搜索索引

商品列表可以直接查 `products`。后来会遇到：

- 按关键字搜索要匹配标题、分类、品牌、关键字。
- 商品列表不想每次都拼很多数据。
- 后续可能接 Elasticsearch/OpenSearch。

先做一个简单搜索索引。

### Repository 增加索引方法

```ts
async upsertSearchIndex(index: ProductSearchIndex) {
  const existed = this.searchIndexes.find((item) => item.productId === index.productId);

  if (existed) {
    Object.assign(existed, index);
    return existed;
  }

  this.searchIndexes.push(index);
  return index;
}

async searchProducts(query: { keyword?: string }) {
  return this.searchIndexes.filter((index) => {
    if (index.saleStatus !== 'on_sale') return false;
    if (!query.keyword) return true;
    return index.searchText.toLowerCase().includes(query.keyword.toLowerCase());
  });
}
```

### `search.service.ts`

```ts
import { Injectable } from '@nestjs/common';
import { CatalogRepository } from '../catalog/catalog.repository';

@Injectable()
export class SearchService {
  constructor(private readonly catalogRepository: CatalogRepository) {}

  async syncProduct(productId: string) {
    const product = await this.catalogRepository.getProduct(productId);
    const category = await this.catalogRepository.getCategory(product.categoryId);
    const brand = product.brandId
      ? await this.catalogRepository.getBrand(product.brandId)
      : null;

    const prices = product.skus
      .filter((sku) => sku.status === 'enabled')
      .map((sku) => sku.salePrice);

    const minPrice = prices.length ? Math.min(...prices) : 0;
    const maxPrice = prices.length ? Math.max(...prices) : 0;

    return this.catalogRepository.upsertSearchIndex({
      productId: product.id,
      title: product.title,
      categoryName: category.name,
      brandName: brand?.name,
      minPrice,
      maxPrice,
      saleStatus: product.saleStatus,
      searchText: [
        product.title,
        product.subTitle,
        product.productNo,
        product.searchKeywords,
        category.name,
        brand?.name,
      ]
        .filter(Boolean)
        .join(' '),
      indexedAt: new Date(),
    });
  }

  searchProducts(query: { keyword?: string }) {
    return this.catalogRepository.searchProducts(query);
  }
}
```

为什么搜索索引保存冗余字段：

- 搜索时不需要每次再关联分类和品牌。
- 读性能更好。
- 代价是商品变更后要同步索引。

为什么第一版不用 Elasticsearch：

- 部署和学习成本高。
- 商品量小时数据库索引表够用。
- 后续需求变大，可以把 `SearchService` 的实现换成 OpenSearch/Elasticsearch。

### `search.controller.ts`

```ts
import { Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { AdminAuthGuard } from '../../common/guards/admin-auth.guard';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { SearchService } from './search.service';

@UseGuards(AdminAuthGuard)
@Controller('/api/admin/v1/search')
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  @RequirePermissions('search:read')
  @Get('/products')
  search(@Query('keyword') keyword?: string) {
    return this.searchService.searchProducts({ keyword });
  }

  @RequirePermissions('search:write')
  @Post('/products/:id/sync')
  sync(@Param('id') id: string) {
    return this.searchService.syncProduct(id);
  }
}
```

### `search.module.ts`

```ts
import { Module } from '@nestjs/common';
import { CatalogModule } from '../catalog/catalog.module';
import { SearchController } from './search.controller';
import { SearchService } from './search.service';

@Module({
  imports: [CatalogModule],
  controllers: [SearchController],
  providers: [SearchService],
})
export class SearchModule {}
```

为什么 `SearchModule` 依赖 `CatalogModule`：

- 搜索索引来源于商品数据。
- 搜索模块不应该自己维护商品主数据。

## 默认权限和菜单

第二章已经有系统权限。现在商品模块要加权限和菜单。

### 权限点

```json
[
  {
    "code": "catalog:read",
    "name": "商品查看",
    "resourceType": "api",
    "resourcePath": "/api/admin/v1/catalog"
  },
  {
    "code": "catalog:write",
    "name": "商品写入",
    "resourceType": "api",
    "resourcePath": "/api/admin/v1/catalog"
  },
  {
    "code": "search:read",
    "name": "搜索查看",
    "resourceType": "api"
  },
  {
    "code": "search:write",
    "name": "搜索同步",
    "resourceType": "api"
  }
]
```

### 菜单

```json
[
  {
    "name": "商品管理",
    "path": "/catalog",
    "icon": "box",
    "permissionCode": "catalog:read",
    "sortNo": 20,
    "visible": true
  },
  {
    "name": "商品列表",
    "path": "/catalog/products",
    "permissionCode": "catalog:read",
    "sortNo": 21,
    "visible": true
  }
]
```

为什么新业务模块要同步权限和菜单：

- 后台用户没有权限就不能访问接口。
- 前端没有菜单就看不到入口。
- 权限和菜单是后台系统的一部分，不是业务接口的附属品。

## 接口调用顺序

### 创建分类

```text
POST /api/admin/v1/catalog/categories
```

```json
{
  "name": "数码产品",
  "code": "digital",
  "sortNo": 1,
  "status": "enabled"
}
```

### 创建品牌

```text
POST /api/admin/v1/catalog/brands
```

```json
{
  "name": "示例品牌",
  "code": "demo-brand",
  "logoUrl": "https://example.com/logo.png",
  "sortNo": 1,
  "status": "enabled"
}
```

### 创建商品

```text
POST /api/admin/v1/catalog/products
```

```json
{
  "productNo": "P10001",
  "categoryId": "1",
  "brandId": "1",
  "title": "示例手机",
  "subTitle": "教学版商品",
  "mainImageUrl": "https://example.com/product.png",
  "detailHtml": "<p>商品详情</p>",
  "sortNo": 1,
  "searchKeywords": "手机 数码",
  "skus": [
    {
      "skuNo": "SKU10001",
      "barcode": "690000000001",
      "spec": {
        "颜色": "黑色",
        "容量": "128G"
      },
      "marketPrice": 3999,
      "salePrice": 3599,
      "costPrice": 3000,
      "stockQty": 100,
      "status": "enabled"
    }
  ],
  "images": [
    {
      "url": "https://example.com/product.png",
      "type": "main",
      "sortNo": 1
    }
  ]
}
```

### 上架商品

```text
POST /api/admin/v1/catalog/products/1/on-sale
```

### 小程序查看商品

```text
GET /api/app/v1/products
GET /api/app/v1/products/1
```

### 同步搜索索引

```text
POST /api/admin/v1/search/products/1/sync
```

### 搜索商品

```text
GET /api/admin/v1/search/products?keyword=手机
```

## 本章核心设计总结

| 设计 | 解决什么问题 | 为什么这样做 |
| --- | --- | --- |
| 分类表 | 商品分层管理 | 支持树结构和筛选 |
| 品牌表 | 品牌统一维护 | 避免商品表里品牌字符串混乱 |
| SPU | 商品主信息 | 标题、详情、分类、品牌属于商品整体 |
| SKU | 具体可购买规格 | 价格、库存、规格属于 SKU |
| 商品图片表 | 多图管理 | 主图、详情图、SKU 图排序 |
| 上下架状态 | 控制销售 | 下架不等于删除，历史订单仍要保留 |
| 后台/小程序接口分开 | 调用方不同 | 后台可看草稿，小程序只看上架 |
| 搜索索引 | 提升查询体验 | 冗余搜索字段，减少复杂关联 |
| 权限和审计 | 后台安全 | 商品修改影响交易，必须可控可追溯 |

### 和真实 ERP 项目的区别

| 教学版 | 真实 ERP 项目 |
| --- | --- |
| 内存保存分类品牌商品 | MySQL + Prisma |
| SKU 里直接放 `stockQty` | 库存独立到 `ec_stock_balance` |
| 更新商品整体替换 SKU | 真实项目要考虑 SKU 被订单引用 |
| 搜索索引用内存数组 | 真实项目写 `ec_product_search_index` |
| 没有店铺商品关系 | 真实项目有 `ec_shop_product` |
| 没有审核状态 | 真实项目可扩展 `audit_status` |

真实项目对应文件：

```text
server/src/modules/catalog
server/src/modules/search
server/prisma/schema.prisma
```

真实项目中商品相关模型：

```text
EcCategory
EcBrand
EcProduct
EcShopProduct
EcSku
EcProductImage
EcProductReview
EcProductSearchIndex
```

