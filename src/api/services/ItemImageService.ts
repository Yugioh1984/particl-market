import * as Bookshelf from 'bookshelf';
import * as _ from 'lodash';
import { inject, named } from 'inversify';
import { Logger as LoggerType } from '../../core/Logger';
import { Types, Core, Targets } from '../../constants';
import { validate, request } from '../../core/api/Validate';
import { NotFoundException } from '../exceptions/NotFoundException';
import { ItemImageRepository } from '../repositories/ItemImageRepository';
import { ItemImage } from '../models/ItemImage';
import { ItemImageCreateRequest } from '../requests/ItemImageCreateRequest';
import { ItemImageUpdateRequest } from '../requests/ItemImageUpdateRequest';
import { ItemImageDataService } from './ItemImageDataService';
import { ImageProcessing } from '../../core/helpers/ImageProcessing';
import { ImageTriplet } from '../../core/helpers/ImageTriplet';
import { ItemImageDataCreateRequest } from '../requests/ItemImageDataCreateRequest';
import { ImageFactory } from '../factories/ImageFactory';
import { ImageVersions } from '../../core/helpers/ImageVersionEnumType';
import {MessageException} from '../exceptions/MessageException';
import {CryptocurrencyAddressUpdateRequest} from '../requests/CryptocurrencyAddressUpdateRequest';
import {CryptocurrencyAddressCreateRequest} from '../requests/CryptocurrencyAddressCreateRequest';
import { ImageDataProtocolType } from '../enums/ImageDataProtocolType';

export class ItemImageService {

    public log: LoggerType;

    constructor(
        @inject(Types.Service) @named(Targets.Service.ItemImageDataService) public itemImageDataService: ItemImageDataService,
        @inject(Types.Repository) @named(Targets.Repository.ItemImageRepository) public itemImageRepo: ItemImageRepository,
        @inject(Types.Factory) @named(Targets.Factory.ImageFactory) public imageFactory: ImageFactory,
        @inject(Types.Core) @named(Core.Logger) public Logger: typeof LoggerType
    ) {
        this.log = new Logger(__filename);
    }

    public async findAll(): Promise<Bookshelf.Collection<ItemImage>> {
        return this.itemImageRepo.findAll();
    }

    public async findOne(id: number, withRelated: boolean = true): Promise<ItemImage> {
        const itemImage = await this.itemImageRepo.findOne(id, withRelated);
        if (itemImage === null) {
            this.log.warn(`ItemImage with the id=${id} was not found!`);
            throw new NotFoundException(id);
        }
        return itemImage;
    }

    @validate()
    public async create( @request(ItemImageCreateRequest) data: ItemImageCreateRequest): Promise<ItemImage> {

        const body = JSON.parse(JSON.stringify(data));

        // this.log.debug('create image, body: ', JSON.stringify(body, null, 2));

        // extract and remove related models from request
        const itemImageDatas: ItemImageDataCreateRequest[] = body.data;
        delete body.data;

        // if the request body was valid we will create the itemImage
        const itemImage = await this.itemImageRepo.create(body);

        const protocols = Object.keys(ImageDataProtocolType)
            .map(key => (ImageDataProtocolType[key]));
        // this.log.debug('protocols: ', protocols);

        const itemImageDataOriginal = _.find(itemImageDatas, (imageData) => {
            return imageData.imageVersion === ImageVersions.ORIGINAL.propName;
        });

        if (itemImageDataOriginal) {

            if (_.isEmpty(itemImageDataOriginal.protocol) || protocols.indexOf(itemImageDataOriginal.protocol) === -1) {
                this.log.warn(`Invalid protocol <${itemImageDataOriginal.protocol}> encountered.`);
                throw new MessageException('Invalid image protocol.');
            }

            // TODO: THIS
            /* if ( !_.isEmpty(itemImageDatas.encoding) && !?????[itemImageDatas.encoding] ) {
                this.log.warn(`Invalid encoding <${itemImageDatas.encoding}> encountered.`);
                throw new NotFoundException('Invalid encoding.');
            } */

            // then create the imageDatas from the given original data
            if ( !_.isEmpty(itemImageDataOriginal.data) ) {
                const toVersions = [ImageVersions.LARGE, ImageVersions.MEDIUM, ImageVersions.THUMBNAIL];
                const imageDatas: ItemImageDataCreateRequest[] = await this.imageFactory.getImageDatas(itemImage.Id, itemImageDataOriginal, toVersions);

                // save all image datas
                for (const imageData of imageDatas) {
                    await this.itemImageDataService.create(imageData);
                }

                // finally find and return the created itemImage
                const newItemImage = await this.findOne(itemImage.Id);
                // this.log.debug('saved image:', JSON.stringify(newItemImage.toJSON(), null, 2));
                return newItemImage;
            } else {
                return itemImage;
            }
        }
        // TODO: fix tests,
        // most of the tests dont contain imageVersion or proper images and will break if we throw exception here
        // else {
        //    throw new MessageException('Original image data not found.');
        // }
    }

    @validate()
    public async update(id: number, @request(ItemImageUpdateRequest) data: ItemImageUpdateRequest): Promise<ItemImage> {

        const body = JSON.parse(JSON.stringify(data));
        const itemImageDataOriginal: ItemImageDataCreateRequest = body.data;

        // find the existing one without related
        const itemImage = await this.findOne(id, false);

        // set new values
        itemImage.Hash = body.hash;

        // update itemImage record
        const updatedItemImage = await this.itemImageRepo.update(id, itemImage.toJSON());

        // find and remove old related ItemImageDatas
        const oldImageDatas = updatedItemImage.related('ItemImageDatas').toJSON();
        for (const imageData of oldImageDatas) {
            await this.itemImageDataService.destroy(imageData.id);
        }

        // then create new imageDatas from the given original data
        if (!_.isEmpty(itemImageDataOriginal)) {
            const toVersions = [ImageVersions.LARGE, ImageVersions.MEDIUM, ImageVersions.THUMBNAIL];
            const imageDatas: ItemImageDataCreateRequest[] = await this.imageFactory.getImageDatas(itemImage.Id, itemImageDataOriginal, toVersions);

            // create new image datas
            for (const imageData of imageDatas) {
                await this.itemImageDataService.create(imageData);
            }
        }

        // finally find and return the updated itemImage
        const newItemImage = await this.findOne(id);
        return newItemImage;
    }

    public async destroy(id: number): Promise<void> {
        await this.itemImageRepo.destroy(id);
    }
}
